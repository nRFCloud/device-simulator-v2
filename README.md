## nRF91 Device Simulator v2 [![npm version](https://img.shields.io/npm/v/@nrfcloud/device-simulator-v2.svg)](https://www.npmjs.com/package/@nrfcloud/device-simulator-v2)

[![Build Status](https://codebuild.us-east-1.amazonaws.com/badges?uuid=eyJlbmNyeXB0ZWREYXRhIjoiZUVaRWN2MzJDN2ZzTFpUY0diSi80WFB4Qm10cmFIZXFCUU44UXZzaUdVUXRwSERPMFZWdEc3b04zcGlaSWdEMXB3dEZybTlRaERZaWlsRW5rc0RCRVlNPSIsIml2UGFyYW1ldGVyU3BlYyI6InBOZ3FOWjltTVNocUpLYmsiLCJtYXRlcmlhbFNldFNlcmlhbCI6MX0%3D&branch=master)](https://console.aws.amazon.com/codesuite/codebuild/projects/device-simulator-v2/history?region=us-east-1)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)

This is an AWS IoT Thing simulator for nRF91. This project combines the [device-simulator](https://github.com/nRFCloud/device-simulator) and [dfu-device-simulator](https://github.com/nRFCloud/dfu-device-simulator) projects. It omits the legacy pairing mechanism and uses the Device API for creating JITP certs and associating a newly provisioned device with your tenant.

## Getting Started
```sh
# install deps
npm ci

# create cache dir (for certs)
mkdir cache

# compile to js
npm run build

# install jq
https://stedolan.github.io/jq/download/
```

## Options
These are the options. Most of them are set with environment variables.

```
  -c, --certs-response <certsResponse>               JSON returned by call to the Device API: POST /devices/{deviceid}/certificates (default: "")
  -e, --endpoint <endpoint>                          AWS IoT MQTT endpoint (default: "")
  -d, --device-id <deviceId>                         ID of the device (default: "rand")
  -o, --device-ownership-code <deviceOwnershipCode>  PIN/ownership code of the device (default: "123456")
  -m, --mqtt-messages-prefix <mqttMessagesPrefix>    The prefix for the MQTT for this tenant for sending and receiving device messages (default: "")
  -s, --services <services>                          Comma-delimited list of services to enable. Any of: [gps,acc,temp,device]
  -a, --app-fw-version <appFwVersion>                Version of the app firmware (default: 1)
  -k, --api-key <apiKey>                             API key for nRF Cloud (default: "")
  -h, --api-host <apiHost>                           API host for nRF Cloud (default: "https://api.dev.nrfcloud.com")
  -l, --link                                         Whether or not to automatically link device to account (default: false)
  -v, --verbose                                      Verbose
  -h, --help                                         Output usage information
```

Use `npx nrfsim --help` to see the most recent list of options.

## Installation (in another repo)
```bash
# install package
npm i -D @nrfcloud/device-simulator-v2

# create directory to cache device certificates
mkdir cache
```

## Usage

### Most basic usage
The most basic usage is just sending in the API key. The device ID will be randomly generated and the rest of the necessary information (mqtt endpoint, cert, and mqtt prefix) will be pulled from the device API. 

This will create a new device with AWS IoT, it will not connect it to your account (use the `-l` flag) for that.
```
npx nrfsim -k <api key>
```

### Link device to your account
This will create a new device and link it to the account associated with the API key.
```
npx nrfsim -k <api key> -d <device id (optional)> -l
```

### Run GPS sensor
```
npx nrfsim -k <api key> -d <device id> -s gps
```

## Recipes
### Connect a device and subscribe to the job updates MQTT topic

1. Log in to [nrfcloud.com](https://nrfcloud.com) and go to the accounts page and grab your API key.
1. Install [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html)
1. If running this on your own AWS account, ensure that Event-based Messages for jobs are enabled in [AWS IoT Settings](https://us-east-1.console.aws.amazon.com/iot/home?region=us-east-1#/settings).
1. Setup your environment:

```sh
export API_KEY=<your_api_key>
export API_HOST=<your_api_host, e.g., https://api.nrfcloud.com>
export AWS_REGION=us-east-1 #if your region is different, change it here
export DEVICE_RAND=$(node -e 'process.stdout.write(Math.floor(1000000000 + Math.random() * 9000000000).toString())')
export DEVICE_ID=nrf-$DEVICE_RAND
export DEVICE_OWNERSHIP_CODE=123456

# create device certificates
export CERTS_RESPONSE=$(curl -X POST $API_HOST/v1/devices/$DEVICE_ID/certificates -d "$DEVICE_OWNERSHIP_CODE" -H "Authorization: Bearer $API_KEY")

# set the MQTT_ENDPOINT
export MQTT_ENDPOINT=$(aws iot describe-endpoint --endpoint-type iot:Data-ATS | jq -r .endpointAddress);
```

5. Run the simulator, which will just-in-time provision (JITP) the device on nRFCloud and subscribe it to the job updates topic (*NOTE*: JITP can take 20-30 seconds, so be patient...):
```sh
npx nrfsim
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
curl -X PUT $API_HOST/v1/association/$DEVICE_ID -d "$DEVICE_OWNERSHIP_CODE" -H "Authorization: Bearer $API_KEY"
```
3. View your device:
```sh
curl $API_HOST/v1/devices/$DEVICE_ID -H "Authorization: Bearer $API_KEY" | jq
```
If you get a `404` error, try again. It can take a few seconds for the database to record the new device association.

4. Set the `MQTT_MESSAGES_PREFIX` enviroment variable:
```sh
export MQTT_MESSAGES_PREFIX=$(curl $API_HOST/v1/account -H "Authorization: Bearer $API_KEY" | jq -r '.topics.messagesPrefix')
```
5. Restart the simulator:
```sh
npx nrfsim
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

8. Verify the job succeeded in the other tab where you ran `npx nrfsim`. You should see something like:
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
npx nrfsim -s gps
```
Or restart the simulator with all the services enabled:
```sh
npx nrfsim -s gps,acc,device,temp
```
If you want to use different data simply replace the appropriate file in [./data/sensors](https://github.com/nRFCloud/device-simulator-v2/tree/master/data/sensors) or change tne appropriate file path(s) in [simulator.ts](src/simulator.ts). (There is some additional GPS data in this repo for routes around Portland, Oregon.)

GPS data is based on NMEA sentences. If you want to make your own GPS data, go to https://nmeagen.org. The "Multi-point line" seems to work best. Lay some points and then click the "Generate NMEA file" button.

### Clean up (if desired)

```sh
curl -X DELETE $API_HOST/v1/dfu-jobs/<your-jobId> -H "Authorization: Bearer $API_KEY"
curl -X DELETE $API_HOST/v1/firmwares/$FILENAME -H "Authorization: Bearer $API_KEY"
curl -X DELETE $API_HOST/v1/devices/$DEVICE_ID -d $DEVICE_OWNERSHIP_CODE -H "Authorization: Bearer $API_KEY"
```
