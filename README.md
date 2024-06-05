# Vonage Voice API - Two outbound calls dropped into a named conference

## Set up

Copy or rename .env-example to .env<br>
Update parameters in .env file<br>

This application has been tested with Node.js version 18.19.1<br>

Install node modules with the command "npm install"<br>

Start application with the command "node two-outbound-calls-conference"<br>

If you run this application locally on your computer, you may use ngrok and establish an https tunnel to local port 8000.

## Turn on RTC webhoooks

In dashboard.nexmo.com, edit your application properties,

enable "RTC (in-app voice & messaging)" and specify the corresponding webhook URL for your Voice API application.

In the attached sample code the webhook call goes to the HTTP 'POST /rtc' path.

## To test this application

Enter in a web browser
`<server>/call2numbers?number1=<number>&number2=<number>`

e.g.<br>
xxxx.ngrok.io/call2numbers?number1=12095551111&number2=12095552222<br>
or<br>
myserver.mycompany.com:32000/call2numbers?number1=12095551111&number2=12095552222

## Some capabilities handled by this sample application code

First number is called, once answered, a greeting is played followed by a ring back tone as music-on-hold while the second call is placed.

Call legs are recorded then downloaded to your local application folder "post-call-data" after calls have terminated.

If first leg terminates prematurely before second leg has answered, second leg will stop ringing.

Once call is established between both parties, either party hanging up will automatically terminate the other leg.

Although this sample code is for two outbound calls, recording of each call leg would work the same with an inbound call connected to an outbound call.


