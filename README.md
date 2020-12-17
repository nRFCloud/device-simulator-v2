## nRF91 Device Simulator v2 [![npm version](https://img.shields.io/npm/v/@nrfcloud/device-simulator-v2.svg)](https://www.npmjs.com/package/@nrfcloud/device-simulator-v2)

[![Build Status](https://codebuild.us-east-1.amazonaws.com/badges?uuid=eyJlbmNyeXB0ZWREYXRhIjoiZUVaRWN2MzJDN2ZzTFpUY0diSi80WFB4Qm10cmFIZXFCUU44UXZzaUdVUXRwSERPMFZWdEc3b04zcGlaSWdEMXB3dEZybTlRaERZaWlsRW5rc0RCRVlNPSIsIml2UGFyYW1ldGVyU3BlYyI6InBOZ3FOWjltTVNocUpLYmsiLCJtYXRlcmlhbFNldFNlcmlhbCI6MX0%3D&branch=saga)](https://console.aws.amazon.com/codesuite/codebuild/projects/device-simulator-v2/history?region=us-east-1)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)

This is an AWS IoT Thing simulator for nRF91. It shows how to use the Device API for creating JITP certs, associating a newly provisioned device with your tenant (account), doing Firmware Over-the-Air Updates (FOTA), and more.

## Usage

### Most basic usage
The most basic usage is just creating a device. For that you just need an API key. The device ID will be randomly generated and the rest of the necessary information (mqtt endpoint, cert, and mqtt prefix) will be pulled from the device API. 

The host defaults to the production environment (https://api.nrfcloud.com). **Nordic Semiconductor personnel**: if you want to use the simulator on our `dev` or `beta` environments, set a `STAGE` env var to `dev` or `beta` (you will need an account for that environment).

This will create a new device with AWS IoT, but it will not associate it to your account (use the `-a` flag) for that.
```
npx @nrfcloud/device-simulator-v2 -k <api key>
```
(If you would like to use the local code instead of npx, first run `yarn build` and then replace `npx @nrfcloud/device-simulator-v2` with `node dist/cli.js`.)

### Associate device to your account
This will create a new device and associate it to the account for the API key.
```
npx @nrfcloud/device-simulator-v2 -k <api key> -a
```

### Simulate sensor outputs
```
npx @nrfcloud/device-simulator-v2 -k <api key> -d <device id (from output of initial command that associated device)> -s gps,acc,device,temp
```

## Options
These are the options. Most of them are set with environment variables.

```
  -k, --api-key <apiKey> (required)                  API key for nRF Cloud (default: "")
  -h, --api-host <apiHost>                           API host for nRF Cloud (default: "https://api.nrfcloud.com")
  -d, --device-id <deviceId>                         ID of the device (default: <nrfsim-randomString>)
  -a, --associate                                    Automatically associate device to your account (default: false)
  -s, --services <services>                          Comma-delimited list of services to enable. Any of: [gps,acc,temp,device]
  -f, --app-fw-version <appFwVersion>                Version of the app firmware (default: 1)
  -c, --certs-response <certsResponse>               JSON returned by call POST /devices/{deviceid}/certificates (default: "")
  -e, --endpoint <endpoint>                          AWS IoT MQTT endpoint (default: "")
  -o, --device-ownership-code <deviceOwnershipCode>  PIN/ownership code of the device (default: "123456")
  -m, --mqtt-messages-prefix <mqttMessagesPrefix>    The prefix for the MQTT for this tenant for sending and receiving device messages (default: "")
  -v, --verbose                                      Output debug information
  -h, --help                                         Output usage information
```

Use `npx @nrfcloud/device-simulator-v2 --help` to see the most recent list of options.

## Caching
The device simulator makes use of a local cache for things like device certs. This is an effort to minimize the requests made to the API. Clearing the cache is easy. 

From the directory in which you ran the simulator:
```sh
rm -rf .ez-cache
```

Or, if actively working on the repo: 
```js
yarn clean
```
Note this is geared towards a *nix environment. Adjust commands accordingly for Windows.
## Contributing
```sh
# install deps
yarn

# install jq
https://stedolan.github.io/jq/download/

# modify your files

# compile
yarn build

# test
node dist/cli.js <options>
```

### Publishing
To publish a new version to npm, follow this recipe:
```bash
# commit all files
git commit -am "<feat|bug|chore|refactor>: <commit message>"

# publish to npm. this will build, ask for a new version, and publish 
# to the npm repo if you run `yarn deploy:beta, it will deploy to the beta tag
yarn deploy[:beta]

# push changes and new tags to github
git push origin HEAD
```

## Recipes
See [cli.ts](src/cli.ts) for the options. Most of these are set with environment variables.

### Set up your environment and provision a device

1. Log in to [nrfcloud.com](https://nrfcloud.com) and go to the accounts page and grab your API key.
1. Install [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html)
1. If running this on your own AWS account, ensure that Event-based Messages for jobs are enabled in [AWS IoT Settings](https://us-east-1.console.aws.amazon.com/iot/home?region=us-east-1#/settings).
1. Set up your environment:

```sh
export API_KEY=<your_api_key>
export API_HOST=<your_api_host, e.g., https://api.nrfcloud.com>
export AWS_REGION=us-east-1 #if your region is different, change it here
export DEVICE_RAND=$(node -e 'process.stdout.write(Math.floor(1000000000 + Math.random() * 9000000000).toString())')
export DEVICE_ID=nrfsim-$DEVICE_RAND
export DEVICE_OWNERSHIP_CODE=123456

# create device certificates
export CERTS_RESPONSE=$(curl -X POST $API_HOST/v1/devices/$DEVICE_ID/certificates -d "$DEVICE_OWNERSHIP_CODE" -H "Authorization: Bearer $API_KEY" -H "Content-Type: text/plain")

# set the MQTT_ENDPOINT
export MQTT_ENDPOINT=$(curl $API_HOST/v1/account -H "Authorization: Bearer $API_KEY" | jq -r .mqttEndpoint)
```

5. Run the simulator, which will just-in-time provision (JITP) the device on nRFCloud (*NOTE*: JITP can take 20-30 seconds, so be patient...):
```sh
# don't forget to "yarn build" to generate the dist dir
node dist/cli.js
```
You should see some JSON output, with something like this at the end:
```sh
************** CONFIG ***********
DEVICE ID: <your_device_id>
DEVICE PIN: 123456
API HOST: https://api.<stage.>nrfcloud.com
API KEY: <your_api_key>
TENANT ID: <your_tenant_id>
STAGE: <stage>
*********************************

starting simulator...

connecting to "a2wg6q8yw7gv5r-ats.iot.us-east-1.amazonaws.com"...

connected

Initializing nrfsim-201004647211712200000 shadow...

************** MESSAGE SENT ***********
TOPIC: $aws/things/nrfsim-1065144894/shadow/update
MESSAGE: {
  "state": {
    "reported": {
      "device": {
        "serviceInfo": {
          "fota_v2": [
            "APP",
            "MODEM"
          ],
          "ui": [
            "GPS",
            "FLIP",
            "TEMP",
            "HUMID",
            "AIR_PRESS",
            "BUTTON",
            "LIGHT"
          ]
        },
        "networkInfo": {
          "currentBand": 12,
          "supportedBands": "",
          "areaCode": 36874,
          "mccmnc": "310410",
          "ipAddress": "10.160.33.51",
          "ueMode": 2,
          "cellID": 84485647,
          "networkMode": "LTE-M GPS"
        },
        "simInfo": {
          "uiccMode": 1,
          "iccid": "",
          "imsi": "204080813516718"
        },
        "deviceInfo": {
          "modemFirmware": "mfw_nrf9160_1.1.0",
          "batteryVoltage": 3824,
          "imei": "352656100441776",
          "board": "nrf9160_pca20035",
          "appVersion": "1",
          "appName": "asset_tracker"
        }
      },
      "connection": {
        "status": "connected",
        "keepalive": 30
      }
    }
  }
}
***************************************

Cannot initialize jobs listener until the device "<your_device_id>" is associated to your account. You can associate the device by running "npx @nrfcloud/device-simulator-v2 -k <api key> -d <your_device_id> -a".
```

This indicates that the device provisioned with AWS and updated its shadow.

### Associate the device with your account (tenant)
1. Shut down the script (CMD or CTRL + C).
2. Call the `association` endpoint:
```sh
curl -X PUT $API_HOST/v1/association/$DEVICE_ID -d "$DEVICE_OWNERSHIP_CODE" -H "Authorization: Bearer $API_KEY" -H "Content-Type: text/plain" | jq
```
3. View your device:
```sh
curl $API_HOST/v1/devices/$DEVICE_ID -H "Authorization: Bearer $API_KEY" | jq
```
If you get a `404` error, try again. It can take a few seconds for the database to record the new device association.

4. Restart the simulator:
```sh
node dist/cli.js
```
You should see this JSON output: 
```sh
confirmed that "<your_device_id>" has been associated with account "<your_tenant_id>"!

listening for new jobs...

************** MESSAGE SENT ***********
TOPIC: dev/<your_tenant_id>/<your_device_id>/jobs/req
MESSAGE: [
  ""
]
***************************************

subscribed to "dev/<your_tenant_id>/<your_device_id>/jobs/rcv"
```

Your device is now associated with your account (tenant) and is ready to start sending and receiving device messages! It is also listening for new FOTA jobs. 

### Create a new Firmware Over-the-Air (FOTA) job
1. Open a new terminal window/tab.
2. Set up the environment variables (see above, but use the same `DEVICE_ID` that you had generated).
3. Upload a dummy firmware file as binary data.
```sh
curl -X POST $API_HOST/v1/firmwares -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/zip" --data-binary @data/fota_app_fw.zip | jq
```
Note that you can also upload your firmware as a base64-encoded string:
```sh
export DATA_DIR=<absolute_path_to_the_data_folder>
export FILE=$(base64 $DATA_DIR/fota_app_fw.zip)
curl -X POST $API_HOST/v1/firmwares -H "Authorization: Bearer $API_KEY" -H "Content-Type: text/plain" -d $FILE | jq
```

4. Set the `BUNDLE_ID` variable by calling the `firmwares` endpoint:
```sh
export BUNDLE_ID=$(curl $API_HOST/v1/firmwares -H "Authorization: Bearer $API_KEY" | jq -r '.items[0].bundleId')
```

5. Enable the "APP" type of FOTA on the device (if not already enabled). (The other two types are "BOOT" and "MODEM", and you can set one or all of these in the array. However, uploading modem firmware is not allowed because this is controlled by Nordic Semiconductor personnel.) First you need to find the latest version of your device:
```sh
export DEVICE_VERSION=$(curl $API_HOST/v1/devices/$DEVICE_ID -H "Authorization: Bearer $API_KEY" | jq -r '.["$meta"].version')
```
You can now use this to set an If-Match header, which is required to prevent "lost updates":
```sh
curl -X PATCH $API_HOST/v1/devices/$DEVICE_ID/state -d '{ "reported": { "device": { "serviceInfo": { "fota_v2": ["APP"] } } } }' -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" -H "If-Match: $DEVICE_VERSION"
```

6. Create the FOTA job
```sh
export JOB_ID=$(curl -X POST $API_HOST/v1/fota-jobs -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" -d '{ "deviceIdentifiers": ["'$DEVICE_ID'"], "bundleId": "'$BUNDLE_ID'" }' | jq -r '.jobId')
```

7. View your FOTA job
```sh
curl $API_HOST/v1/fota-jobs/$JOB_ID -H "Authorization: Bearer $API_KEY" | jq
```

8. Verify the job succeeded in the other tab where you ran `node dist/cli.js`. You should see a series of messages that walk through the firmware installation lifecycle:
```sh
************** <your_device_id> ***********
JOB ID: <your_job_id>
OLD STATUS: IN_PROGRESS (1)
NEW STATUS: SUCCEEDED (3)
MESSAGE: installation successful for "APP" firmware file from "<your_bundle_id_url>"
********************************************
```

If successful, you should see a message like this: 
```sh
job "<your_job_id>" succeeded!
```

If you do not see this it's possible that a previously created job has not succeeded. This will block any newly created jobs from running. You can check this by using the `GET /fota-jobs` endpoint (as you did above) and then using `DELETE $API_HOST/v1/fota-jobs/<your-jobId>` for any previously created jobs that has a status other than `SUCCEEDED`.

9. You can also verify the job succeeded by using the Device API:
```sh
curl $API_HOST/v1/fota-job-execution-statuses/$JOB_ID -H "Authorization: Bearer $API_KEY" | jq
```
or 
```sh
curl $API_HOST/v1/fota-job-executions/$DEVICE_ID/$JOB_ID -H "Authorization: Bearer $API_KEY" | jq
```

### Enable Sensors and Services
1. Shut down the script (CMD or CTRL + C).
2. Restart the simulator with the GPS service enabled:
```sh
node dist/cli.js -s gps
```
Or restart the simulator with all the services enabled:
```sh
node dist/cli.js -s gps,acc,device,temp
```
If you want to use different data simply replace the appropriate file in [./data/sensors](https://github.com/nRFCloud/device-simulator-v2/tree/saga/data/sensors) or change tne appropriate file path(s) in [cli.ts](src/cli.ts). (There is some additional GPS data in this repo for routes around Portland, Oregon.)

GPS data is based on NMEA sentences. If you want to make your own GPS data, go to https://nmeagen.org. The "Multi-point line" seems to work best. Lay some points and then click the "Generate NMEA file" button.

### Clean up (if desired)

```sh
curl -X DELETE $API_HOST/v1/fota-jobs/<your-jobId> -H "Authorization: Bearer $API_KEY"
curl -X DELETE $API_HOST/v1/firmwares/$BUNDLE_ID -H "Authorization: Bearer $API_KEY"
curl -X DELETE $API_HOST/v1/devices/$DEVICE_ID -d $DEVICE_OWNERSHIP_CODE -H "Authorization: Bearer $API_KEY" -H "Content-Type: text/plain"
```

