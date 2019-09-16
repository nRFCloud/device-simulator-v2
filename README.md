## nRF91 Device Simulator v2

This is an AWS IoT Thing simulator for nRF91. This project combines the [device-simulator](https://github.com/nRFCloud/device-simulator) and [dfu-device-simulator](https://github.com/nRFCloud/dfu-device-simulator) projects. It omits the legacy pairing mechanism and uses the Device API for creating JITP certs and associating a newly provisioned device with your tenant.

### Getting Started
```sh
# install deps
npm i

# compile to js
npx tsc

# install jq
https://stedolan.github.io/jq/download/
```

### Commands
See [simulator.ts](src/simulator.ts) for the options. Most of these are set with environment variables.

### Connect a device and subscribe to the job updates MQTT topic

1. Login to [nrfcloud dev site](https://dev.nrfcloud.com) and go to the accounts page and grab your API key
1. Install [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html)
1. If running this on your own AWS account, ensure that Event-based Messages for jobs are enabled in [AWS IoT Settings](https://us-east-1.console.aws.amazon.com/iot/home?region=us-east-1#/settings).
1. Setup your environment:

```sh
export API_KEY=<your_api_key>
export API_HOST=<your_api_host, e.g., https://api.dev.nrfcloud.com>
export AWS_REGION=us-east-1 #if your region is different, change it here
export DEVICE_RAND=$(node -e 'process.stdout.write(Math.floor(1000000000 + Math.random() * 9000000000).toString())')
export DEVICE_ID=nrf-$DEVICE_RAND
export DEVICE_PIN=123456

# create device certificates
export CERTS_RESPONSE=$(curl -X POST $API_HOST/v1/devices/$DEVICE_ID/certificates -d "$DEVICE_PIN" -H "Authorization: Bearer $API_KEY")

# set the MQTT_ENDPOINT
export MQTT_ENDPOINT=$(aws iot describe-endpoint --endpoint-type iot:Data-ATS | grep endpointAddress | awk '{ print  $2; }' | tr -d '"')
```

5. Run the simulator, which will just-in-time provision (JITP) the device on nRFCloud and subscribe it to the job updates topic (*NOTE*: JITP can take 20-30 seconds, so be patient...):
```sh
node dist/simulator.js
```
You should see some JSON output, with something like this at the end:
```sh
reported firmware version 1
```
This indicates that the device connected to AWS, was provisioned, and updated its shadow.

### Associate the device with your account (tenant)
1. Shut down the script (CMD or CTRL + C).
2. Call the `association` endpoint:
```sh
curl -X PUT $API_HOST/v1/association/$DEVICE_ID -d "$DEVICE_PIN" -H "Authorization: Bearer $API_KEY"
```
3. View your device:
```sh
curl $API_HOST/v1/devices/$DEVICE_ID -H "Authorization: Bearer $API_KEY" | jq
```
4. Set the `MQTT_MESSAGES_PREFIX` enviroment variable:
```sh
export MQTT_MESSAGES_PREFIX=$(curl $API_HOST/v1/account -H "Authorization: Bearer $API_KEY" | jq -r '.topics.messagesPrefix')
```
5. Restart the simulator:
```sh
node dist/simulator.js
```
You should now see an additional line of JSON output indicating that your device has successfully subscribed to the jobs topic for DFU:
```sh
subscribed to $aws/things/<deviceId>/jobs/notify-next
```

### Create a new DFU job
1. Open a new terminal window/tab.
2. Set up the environment variables (see above, but use the same `DEVICE_ID` that you had generated).
3. Upload a dummy firmware file as a base64-encoded string.
```sh
curl -X POST $API_HOST/v1/firmwares -H "Authorization: Bearer $API_KEY" -d '{"file": "ewogICAgIm9wZXJhdGlvbiI6ImN1c3RvbUpvYiIsCiAgICAib3RoZXJJbmZvIjoic29tZVZhbHVlIgp9Cg==", "filename": "my-firmware.bin"}'
```

4. Set the `FILENAME` variable by calling the `firmwares` endpoint:
```sh
export FILENAME=$(curl $API_HOST/v1/firmwares -H "Authorization: Bearer $API_KEY" | jq -r '.items[0].filename')
```

5. Enable DFU on the device (if not already enabled)
```sh
curl -X PATCH $API_HOST/v1/devices/$DEVICE_ID/state -d '{ "reported": { "device": { "serviceInfo": ["dfu"] } } }' -H "Authorization: Bearer $API_KEY"
```

6. Create the DFU job
```sh
curl -X POST $API_HOST/v1/dfu-jobs -H "Authorization: Bearer $API_KEY" -d '{ "deviceIdentifiers": ["'$DEVICE_ID'"], "filename": "'$FILENAME'", "version": "1.1" }'
```

7. View your DFU job
```sh
curl $API_HOST/v1/dfu-jobs -H "Authorization: Bearer $API_KEY" | jq
```

8. Verify the job succeeded in the other tab where you ran `node dist/simulator.js`. You should see something like:
```sh
< $aws/things/nrf-9354733136/jobs/notify-next
<
{
  "timestamp": 1568062501
}
```
If you do not see this it's possible that a previously created job has not succeeded. This will block any newly created jobs from running. You can check this by using the `GET /dfu-jobs` endpoint (as you did above) and then using `DELETE $API_HOST/v1/dfu-jobs/<your-jobId>` for any 
previously created jobs that has a status other than `SUCCEEDED`.

### Enable Sensors and Services
1. Shut down the script (CMD or CTRL + C).
2. Restart the simulator with the GPS service enabled:
```sh
node dist/simulator.js -s gps
```
Or restart the simulator with all the services enabled:
```sh
node dist/simulator.js -s gps,acc,device,temp
```
If you want to use different data simply replace the appropriate file in ./data/sensors or change tne appropriate file path(s) in [simulator.ts](src/simulator.ts). (There is some additional GPS data in this repo for routes around Portland, Oregon.)

### Clean up (if desired)

```sh
curl -X DELETE $API_HOST/v1/dfu-jobs/<your-jobId> -H "Authorization: Bearer $API_KEY"
curl -X DELETE $API_HOST/v1/firmwares/$FILENAME -H "Authorization: Bearer $API_KEY"
curl -X DELETE $API_HOST/v1/devices/$DEVICE_ID -H "Authorization: Bearer $API_KEY"
```
