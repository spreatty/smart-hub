const express = require('express');
const axios = require('axios');
const config = require('./config.json');

const log = (...args) => console.log(new Date().toISOString().slice(0, -1).replace('T', ' '), ...args);

var isAcOn = process.argv[2] == 'on';
var isAcDesiredOn = isAcOn;
var isPowerOn = process.argv[3] == 'on';
log('AC state:', isAcOn ? 'on' : 'off');
log('Power state:', isPowerOn ? 'on' : 'off');

const switchAC = async on => {
    const acState = on ? 'on' : 'off';
    try {
        const res = await axios.post(on ? config.acOnUrl: config.acOffUrl);
        log(`Switched AC ${acState}.`, 'Response code:', res.status);
        return true;
    } catch(e) {
        const msg = `Failed to switch AC ${acState}.`;
        if (e.response) {
            log(msg, 'Response code:', e.response.status);
        } else {
            log(msg, 'Error:', e.message);
        }
        return false;
    }
};

const onPowerOn = async () => {
    if (isAcDesiredOn && !isAcOn) {
        if (await switchAC(true))
            isAcOn = true;
    }
};

const onPowerOff = async () => {
    if (isAcOn) {
       if (await switchAC(false))
            isAcOn = false;
    }
};

const onPowerUpdate = status => {
    if (status == 'powerOn') {
        isPowerOn = true;
        onPowerOn();
    } else if (status == 'powerOff') {
        isPowerOn = false;
        onPowerOff();
    }
};

(async () => {
    const app = express();
    app.use(express.json());
    
    app.post('/power', (req, res) => {
        log('Power notification:', req.body);
        if (req.body.status)
            onPowerUpdate(req.body.status);
        res.sendStatus(201);
    });

    app.post('/status', (req, res) => {
        res.send({ power: isPowerOn, ac: isAcOn, acDesired: isAcDesiredOn });
    });

    app.post('/acon', async (req, res) => {
        log('AC on intent')
        let status = 'already';
        isAcDesiredOn = true;
        if (!isAcOn && isPowerOn) {
            log('Switching is needed and possible')
            if (await switchAC(true)) {
                isAcOn = true;
                status = 'success';
                log('Successfully switched on');
            } else {
                status = 'fail'
                log('Failed switching on');
            }
        } else if (!isPowerOn) {
            status = 'scheduled';
            log('No power for AC yet');
        }
        res.send({status});
    });

    app.post('/acoff', async (req, res) => {
        log('AC off intent')
        let status = 'already';
        isAcDesiredOn = false;
        if (isAcOn) {
            log('Switching is needed')
            if (await switchAC(false)) {
                isAcOn = false;
                status = 'success';
                log('Successfully switched off');
            } else {
                status = 'fail'
                log('Failed switching off');
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