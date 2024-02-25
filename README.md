# Vonage Voice API - Two outbound calls dropped into a named conference

## Set up

Copy or rename .env-example to .env<br>
Update parameters in .env file<br>

This application has been tested with Node.js version 16.15<br>

Install node modules with the command "npm install"<br>

Start application with the command "node two-outbound-calls-conference"<br>

If you run this application locally on your computer, you may use ngrok and establish an https tunnel to local port 8000.

## To test this application

Enter in a web browser
`<server>/call2numbers?number1=<number>&number2=<number>`

e.g.<br>
xxxx.ngrok.io/call2numbers?number1=12095551111&number2=12095552222<br>
or<br>
myserver.mycompany.com:32000/call2numbers?number1=12095551111&number2=12095552222
