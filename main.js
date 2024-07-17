const express = require('express');
const cors = require('cors');
const axios = require('axios');
const config = require('./config.json');

const log = (...args) => console.log(new Date().toLocaleString(), ...args);

const getPowerState = async () => {
    const res = await axios.get(config.powerStatusEndpoint);
    const powerState = powerStates.indexOf(res.data.power);
    if (powerState != -1) {
        return powerState;
    } else {
        throw new Error(`Unexpected power state "${res.data.power}"`);
    }
};

const powerOff = 0, powerBackup = 1, powerMain = 2;
const powerStates = ['off', 'backup', 'main'];
var powerState;
const acOff = 0, acOn = 1, acRequested = 2;
const acStates = ['off', 'on', 'requested'];
var acState;

const notify = () => {
    config.notificationUrls.forEach(async url => {
        try {
            const res = await axios.post(url, {status: acStates[acState]});
            log('Response code:', res.status);
        } catch(e) {
            if (e.response) {
                log('Response code:', e.response.status);
            } else {
                log('Error:', e.message);
            }
        }
    });
};

const switchAC = async on => {
    const acToggle = on ? 'on' : 'off';
    try {
        const res = await axios.post(on ? config.acOnUrl: config.acOffUrl);
        log(`Switched AC ${acToggle}.`, 'Response code:', res.status);
        return true;
    } catch(e) {
        const msg = `Failed to switch AC ${acToggle}.`;
        if (e.response) {
            log(msg, 'Response code:', e.response.status);
        } else {
            log(msg, 'Error:', e.message);
        }
        return false;
    }
};

const onPowerOn = async () => {
    if (acState == acRequested) {
        if (await switchAC(true)) {
            acState = acOn;
            notify();
        }
    }
};

const onPowerOff = async () => {
    if (acState == acOn) {
       if (await switchAC(false)) {
            acState = acRequested;
            notify();
       }
    }
};

const onPowerUpdate = () => {
    if (powerState == powerMain) {
        onPowerOn();
    } else if (powerState == powerOff) {
        onPowerOff();
    }
};

(async () => {
    acState = acStates.indexOf(process.argv[2]);
    if (acState == -1) {
        acState = acOff;
    }
    log('AC state:', acStates[acState]);

    powerState = await getPowerState();
    log('Power state:', powerStates[powerState]);

    const app = express();
    app.use(express.json(), cors({ origin: config.corsOrigin }));
    
    app.post('/power', (req, res) => {
        log('Power change:', req.body);
        const newState = powerStates.indexOf(req.body.status);
        if (newState != -1) {
            powerState = newState;
            onPowerUpdate();
        }
        res.sendStatus(201);
    });

    app.get('/status', (req, res) => {
        res.send({ power: powerStates[powerState], ac: acStates[acState] });
    });

    app.post('/acon', async (req, res) => {
        log('AC on intent')
        if (acState == acOff) {
            acState = acRequested;
            notify();
        }
        let status = 'already';
        if (acState != acOn && powerState == powerMain) {
            log('Switching AC on')
            if (await switchAC(true)) {
                acState = acOn;
                status = 'success';
                notify();
            } else {
                status = 'fail'
            }
        } else if (powerState != powerMain) {
            status = 'scheduled';
            log('No power for AC yet');
        }
        res.send({status});
    });

    app.post('/acoff', async (req, res) => {
        log('AC off intent')
        let status = 'already';
        if (acState == acRequested) {
            acState = acOff;
            status = 'unscheduled';
            log('Removed AC on intent');
            notify();
        }
        if (acState == acOn) {
            log('Switching AC off')
            if (await switchAC(false)) {
                acState = acOff;
                status = 'success';
                notify();
            } else {
                status = 'fail'
            }
        }
        res.send({status});
    });

    try {
        await new Promise((resolve, reject) => {
            try {
                app.listen(config.port, () => {
                    log('Local server ready', config.port);
                    resolve();
                });
            } catch(e) {
                log('Local server failed to start', e);
                reject(e);
            }
        });
    } catch(e) {
        return
    }
})();