'use strict'

//-------------

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const app = express();

const request = require('request');
const fs = require('fs');

//--- for VCR (Vonage Code Runtime - Serverless infra - aka Neru) installation ----

const neruHost = process.env.NERU_HOST;
console.log('neruHost:', neruHost);

//------------------------------

const serviceNumber = process.env.SERVICE_PHONE_NUMBER;

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

const apiRegion = "https://" + process.env.API_REGION;

const options = {
  apiHost: apiRegion
};

const { Vonage } = require('@vonage/server-sdk');

const vonage = new Vonage(credentials, options);

//--

const vonageNr = new Vonage(credentials, {} ); 
const appId = process.env.APP_ID;
const apiBaseUrl = "https://api-us.vonage.com";

const privateKey = fs.readFileSync('./.private.key');

const { tokenGenerate } = require('@vonage/jwt');

//---- CORS policy - Update this section as needed ----

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "OPTIONS,GET,POST,PUT,DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
  next();
});

//---

app.use(bodyParser.json());

//==========================================================

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
    advanced_machine_detection: {
      "behavior": "continue",
      "mode": "default",  // use this value for the latest AMD implementation
      "beep_timeout": 45
    },
    ringing_timer: 70,
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

app.post('/event1', async (req, res) => {

  res.status(200).send('Ok');

  if (req.body.type == 'transfer') {

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
    advanced_machine_detection: {
      "behavior": "continue",
      "mode": "default",  // use this value for the latest AMD implementation
      "beep_timeout": 45
    },
    ringing_timer: 70,
      answer_url: ['https://' + hostName + '/answer2?original_uuid=' + uuid],
      answer_method: 'GET',
      event_url: ['https://' + hostName + '/event2?original_uuid=' + uuid],
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

  if (req.body.status == 'completed') {

    const firstLegUuid = req.body.uuid;

    const secondLegUuid = app.get('second_leg_with_' + firstLegUuid);

    if (secondLegUuid != null) {  // if second leg has started and not yet terminated

      // get status of second call
      // see https://nexmoinc.github.io/conversation-service-docs/docs/api/get-legs
      const accessToken = tokenGenerate(appId, privateKey, {});

      await request.get(apiRegion + '/v1/legs/' + secondLegUuid, {
          headers: {
              'Authorization': 'Bearer ' + accessToken,
              "content-type": "application/json",
          },
          json: true,
        }, function (error, response, body) {
          if (error) {
            console.log('error getting second leg info', secondLegUuid, error.body);
          }
          else {
            
            console.log('>>> leg info', secondLegUuid, response.body.status);

            if (response.body.status != "completed") {
              // hang up call 2

              console.log('>>> hang up second call', secondLegUuid);

              vonage.voice.hangupCall(secondLegUuid)  // then terminate second call leg
                .then(res => console.log('>>> terminated second call leg'))
                .catch(err => {
                  console.log(">>> terminating second call leg error", err)
                  // you may see error 400 bad request if second leg is already terminated, that's not a problem
                });
            };

          }
      });

    } else {

      console.log('>>> no second leg yet associated to first leg:', firstLegUuid);

    }

  };  

});

//-----

app.get('/answer2', (req, res) => { 

    const originalUuid = req.query.original_uuid;

    // track call 2 uuid with call 1 uuid
    // originalUuid --> call 1
    // req.query.uuid --> call 2
    app.set('second_leg_with_' + originalUuid, req.query.uuid);

    //-- put call 2 into same named conference --
    let nccoResponse = [
        {
          "action": "conversation",
          "endOnExit": true,
          "startOnEnter":true,
          "name": "conference_" + originalUuid
        }
      ];

    res.status(200).json(nccoResponse);

});

//-----

app.post('/event2', (req, res) => {

    res.status(200).send('Ok');

    if (req.body.type == 'transfer') {

      const call1Uuid = req.query.original_uuid;  

      vonage.voice.stopStreamAudio(call1Uuid)
        .then(res => console.log(`>>> stop streaming ring back tone to call ${call1Uuid} status:`, res))
        .catch(err => {
          console.log(`>>> stop streaming ring back tone to call ${call1Uuid} error:`, err.body);
        });

    };

    //---

    if (req.body.status == 'completed') {

      const originalUuid = req.query.original_uuid;
      app.set('second_leg_with_' + originalUuid, null); // reset value

    }  

    //---------------

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

//--------

app.post('/rtc', async(req, res) => {

  res.status(200).send('Ok');

  switch (req.body.type) {

    case "sip:answered": // leg answered 

      if (req.body.body.channel.type == "phone") {

        const uuid = req.body.body.channel.legs[0].leg_id;

        //-- start "leg" recording --
        // see https://nexmoinc.github.io/conversation-service-docs/docs/api/create-recording
        const accessToken = tokenGenerate(appId, privateKey, {});

        request.post(apiRegion + '/v1/legs/' + uuid + '/recording', {
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                "content-type": "application/json",
            },
            body: {
              "split": true,
              "streamed": true,
              // "beep": true,
              "public": true,
              "validity_time": 7200,
              "format": "mp3",
              "transcription": {
                "language":"en-US",
                "sentiment_analysis": true
              }
            },
            json: true,
          }, function (error, response, body) {
            if (error) {
              console.log('error start recording leg:', error.body);
            }
            else {
              console.log('start recording leg:', response.body);
            }
        });

      }

      break;

    case "audio:record:done": // leg recording, get the audio file
      console.log('\n>>> /rtc audio:record:done');
      console.log('req.body.body.destination_url', req.body.body.destination_url);
      console.log('req.body.body.recording_id', req.body.body.recording_id);

      await vonageNr.voice.downloadRecording(req.body.body.destination_url, './post-call-data/' + req.body.body.recording_id + '_' + req.body.body.channel.id + '.mp3');
  
      break;

    case "audio:transcribe:done": // leg recording, get the transcript
      console.log('\n>>> /rtc audio:transcribe:done');
      console.log('req.body.body.transcription_url', req.body.body.transcription_url);
      console.log('req.body.body.recording_id', req.body.body.recording_id);

      await vonageNr.voice.downloadTranscription(req.body.body.transcription_url, './post-call-data/' + req.body.body.recording_id + '.txt');  

      break;      
    
    default:  
      // do nothing

  }

});

//--------------- for VCR (aka Neru) ----------------

app.get('/_/health', async (req, res) => {
   
  res.status(200).send('Ok');

});

//=========================================

const port = process.env.NERU_APP_PORT || process.env.PORT || 8000;

app.listen(port, () => console.log(`Application listening on port ${port}`));

//------------