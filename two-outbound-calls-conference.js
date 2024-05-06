'use strict'

//-------------

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const app = express();

const request = require('request');
const fs = require('fs');

//--- for VCR (aka Neru) installation ----

const neruHost = process.env.NERU_HOST;
console.log('neruHost:', neruHost);

//------------------------------

const serviceNumber = process.env.SERVICE_NUMBER;

// ------------------

console.log("Service phone number:", serviceNumber);

//-------------------

const { Auth } = require('@vonage/auth');

const credentials = new Auth({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,
  applicationId: process.env.APP_ID,
  privateKey: './.private.key'    // private key file name with a leading dot 
});

// sample API endpoint value, set the relevant one for your own application
const apiRegion = "https://api-us-3.vonage.com";  // must be consistent with the corresponding application's "Region" paremeter value (dashboard.nexmo.com)

const options = {
  apiHost: apiRegion
};

const { Vonage } = require('@vonage/server-sdk');

const vonage = new Vonage(credentials, options);

//--

const appId = process.env.APP_ID;

const privateKey = fs.readFileSync('./.private.key');

const { tokenGenerate } = require('@vonage/jwt');

//==========================================================

app.use(bodyParser.json());

//--- test making calls from a local request
// corresponds to a HTTP GET request
// enter in a web browser
// <server>/call2numbers?number1=<number>&number2=<number>
// e.g. xxxx.ngrok.io/call2numbers?number1=12095551111&number2=12095552222

app.get('/call2numbers', (req, res) => {

  res.status(200).send('Ok');

  let hostName;

  if (neruHost) {
    hostName = neruHost;
  } else {
    hostName = req.hostname;
  }

  //--

  const number1 = req.query.number1;
  const number2 = req.query.number2;

  // TO DO - add a check that both numbers are present and are valid numbers with a basic NI lookup

  vonage.voice.createOutboundCall({
    to: [{
      type: 'phone',
      number: number1
    }],
    from: {
     type: 'phone',
     number: serviceNumber
    },
    answer_url: ['https://' + hostName + '/answer1?number2=' + number2],
    answer_method: 'GET',
    event_url: ['https://' + hostName + '/event1?number2=' + number2],
    event_method: 'POST'
    })
      .then(res => console.log(`>>> outgoing call 1 to ${number1} status:`, res))
      .catch(err => {
        console.error(`>>> outgoing call 1 to ${number1} error:`, err)
        console.error(err.body);
      });

});

//----

app.get('/answer1', (req, res) => {

    //-- play an announcement, then put call 1 into a named conference --

    let nccoResponse = [
        {
          action: 'talk',
          text: 'Please wait while we are connecting your call to the other party'
        },
        {
          "action": "conversation",
          "endOnExit": true,
          "startOnEnter":true,
          "name": "conference_" + req.query.uuid
        }
      ];

    res.status(200).json(nccoResponse);

});

//--------

app.post('/event1', (req, res) => {

  res.status(200).send('Ok');

  if (req.body.type === 'transfer') {

    let hostName;

    if (neruHost) {
      hostName = neruHost;
    } else {
      hostName = req.hostname;
    }

    const uuid = req.body.uuid;

    //-- play audio file with ring back tone sound to call 1 --

    vonage.voice.streamAudio(uuid, 'http://client-sdk-cdn-files.s3.us-east-2.amazonaws.com/us.mp3', 0, -0.6)
      .then(res => console.log(`>>> streaming ring back tone to call ${uuid} status:`, res))
      .catch(err => {
        console.error(`>>> streaming ring back tone to call ${uuid} error:`, err)
        console.error(err.body);
      });

    //-- call number 2 --

    const number2 = req.query.number2;  

    vonage.voice.createOutboundCall({
      to: [{
        type: 'phone',
        number: number2
      }],
      from: {
       type: 'phone',
       number: serviceNumber
      },
      answer_url: ['https://' + hostName + '/answer2?originalUuid=' + uuid],
      answer_method: 'GET',
      event_url: ['https://' + hostName + '/event2?originalUuid=' + uuid],
      event_method: 'POST'
      })
      .then(res => {
        console.log(`>>> outgoing call 2 to ${number2} status:`, res);
        app.set('second_leg_with_' + uuid, res.uuid); // mappind 2nd leg uuid with 1st leg uuid
        })
      .catch(err => {
        console.error(`>>> outgoing call 2 to ${number2} error:`, err);
        console.error(err.body);
      });
  };

  //---------

  if (req.body.status === 'completed') {

    const firstLegUuid = req.body.uuid;

    const secongLegUuid = app.get('second_leg_with_' + firstLegUuid);

    if (secongLegUuid != null) {  // if second leg has started

      vonage.voice.hangupCall(secongLegUuid)  // then terminate second call leg
        .then(res => console.log('>>> terminated second call leg'))
        .catch(err => {
          console.error(`>>> terminating second call leg error - zone 1:`, err.response)
          // you may see error 400 bad request if second leg is already terminated, that's not a problem
        });

      app.set('second_leg_with_' + firstLegUuid, null); // clear parameter 

    } else {

      console.log('>>> no second leg yet');

    }

  };  

});

//-----

app.get('/answer2', (req, res) => {

    //-- put call 2 into same named conference --

    let nccoResponse = [
        {
          "action": "conversation",
          "endOnExit": true,
          "startOnEnter":true,
          "name": "conference_" + req.query.originalUuid
        }
      ];

    res.status(200).json(nccoResponse);

});

//-----

app.post('/event2', (req, res) => {

    res.status(200).send('Ok');

    if (req.body.type === 'transfer') {

      const call1Uuid = req.query.originalUuid;  

      vonage.voice.stopStreamAudio(call1Uuid)
        .then(res => console.log(`>>> stop streaming ring back tone to call ${call1Uuid} status:`, res))
        .catch(err => {
          console.error(`>>> stop streaming ring back tone to call ${call1Uuid} error:`, err.response);
          // console.error(err.body);
        });

      // test call state of call1Uuid

      const accessToken = tokenGenerate(appId, privateKey, {});

      // see https://nexmoinc.github.io/conversation-service-docs/docs/api/get-legs
      request.get(apiRegion + '/v1/legs/' + call1Uuid, {
          headers: {
              'Authorization': 'Bearer ' + accessToken,
              "content-type": "application/json",
          },
          json: true,
        }, function (error, response, body) {
          if (error) {
            console.log('error get call leg', call1Uuid, 'status:', error);
          }
          else {
            // console.log('get call leg', call1Uuid, ':', response.body.state.status);

            if (response.body.state.status === 'completed') {  // if 1st call leg has terminated
              vonage.voice.hangupCall(req.body.uuid)          // then terminate second call leg
                .then(res => console.log('>>> terminated second call leg'))
                  .catch(err => {
                    console.error(`>>> terminating second call leg error - zone 2:`, err.response)
                  });
              }

            }

      });

    };

});

//----- default answer and event webhooks to process unwanted incoming calls --
//-- modify those relative paths to match your actual webhook URLs as set in the --
//-- dashboard (dashboard.nexmo.com) for this application --

app.get('/answer', (req, res) => {

    const hostName = req.hostname;

    const uuid = req.query.uuid;

    //----------

    let nccoResponse = [
        {
          "action": "talk",
          "text": "This number does not accept incoming calls."
        }
      ];

    res.status(200).json(nccoResponse);

});

//--------

app.post('/event', (req, res) => {

  res.status(200).send('Ok');

});

//--------------- for VCR (aka Neru) ----------------

app.get('/_/health', async (req, res) => {
   
  res.status(200).send('Ok');

});

//=========================================

const port = process.env.NERU_APP_PORT || process.env.PORT || 8000;

app.listen(port, () => console.log(`Application listening on port ${port}`));

//------------