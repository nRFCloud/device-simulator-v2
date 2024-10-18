## nRF91 Device Simulator v2 [![npm version](https://img.shields.io/npm/v/@nrfcloud/device-simulator-v2.svg)](https://www.npmjs.com/package/@nrfcloud/device-simulator-v2)

[![Build Status](https://codebuild.us-east-1.amazonaws.com/badges?uuid=eyJlbmNyeXB0ZWREYXRhIjoiZUVaRWN2MzJDN2ZzTFpUY0diSi80WFB4Qm10cmFIZXFCUU44UXZzaUdVUXRwSERPMFZWdEc3b04zcGlaSWdEMXB3dEZybTlRaERZaWlsRW5rc0RCRVlNPSIsIml2UGFyYW1ldGVyU3BlYyI6InBOZ3FOWjltTVNocUpLYmsiLCJtYXRlcmlhbFNldFNlcmlhbCI6MX0%3D&branch=saga)](https://console.aws.amazon.com/codesuite/codebuild/projects/device-simulator-v2/history?region=us-east-1)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)

This is a software device simulator that shows how to use the [nRF Cloud APIs](https://docs.nordicsemi.com/bundle/nrf-cloud/page/APIs/APIOverview.html) to create device certificates, onboard a device to your team, do Firmware Over-the-Air Updates (FOTA), and more. Although we call it a "simulator", this tool creates real, working IoT devices that run from your local machine.

## Usage

### CLI Options and Help
Run `npx @nrfcloud/device-simulator-v2 --help` to see the list of options and additional information.

### Most basic usage
The most basic usage is just creating a device that connects to nRF Cloud. For that you just need an API key. The device ID can be randomly generated, and the rest of the necessary information (mqtt endpoint, cert, and mqtt prefix) will be set automatically. 

The following command will create a new device with AWS IoT, but it will not onboard it to your team (use the `-a preconnect` flag for onboarding).
```
npx @nrfcloud/device-simulator-v2 -k <api key> [-d <desired device ID>] -t atv2
```
If you would like to use the local code instead of npx, first run `yarn && yarn build` and then replace `npx @nrfcloud/device-simulator-v2` with `node dist/cli.js`.

You can name the device whatever you want with the `-d` option. If not present, it will be named `nrfsim-<random 21 digits>`.

### Onboard a device to your team
This example will onboard a device to nRF Cloud by creating a new simulated device and associating it to the user's team. The user's API key authenticates the REST request. A default device shadow will be created in the style of the Asset Tracker v2 (atv2) sample firmware. For the pre-connect mode of onboarding, the device simulator will create and provide self-signed certificates in the onboarding process.
```
npx @nrfcloud/device-simulator-v2 -k <api key> -t atv2 -a preconnect
```
Note: If you are using certificates for an MQTT Team Device (formerly known as an Account Device), you do not need to use the `-a preconnect` flag because by definition, these devices are already onboarded to your team.
See the [documentation](https://docs.nordicsemi.com/bundle/nrf-cloud/page/Devices/Properties/Types.html) for more information about the different types of devices supported by nRF Cloud.

### Simulate sensor outputs
After creating and onboarding your device, you can include any combination of the options listed after `-s` below, to simulate the device sending messages containing device sensor data:
```
npx @nrfcloud/device-simulator-v2 -k <api key> -d <device ID you already onboarded> -s gps,acc,device,temp
```
*Note! Including `device` in the list will generate a LOT of device info messages which may overrun your Web browser. Best not to run it more than a few seconds with it, or you can leave out `device` and run it long-term.*

*Note! The `acc` option sends FLIP accelerometer messages, simulating the device being flipped right-side-up or upside-down. This was a feature of the Asset Tracker v1 firmware example that has been removed for the currently supported Asset Tracker v2.*

If you want to use different GPS data, replace the appropriate file in [./data/sensors](https://github.com/nRFCloud/device-simulator-v2/tree/saga/data/sensors) or change tne appropriate file path(s) in [cli.ts](src/cli.ts). (There is some additional GPS data in this repo for routes around Portland, Oregon, USA.)

GPS data is based on NMEA sentences. If you want to make your own GPS data, go to https://nmeagen.org. The "Multi-point line" seems to work best. Lay some points and then click the "Generate NMEA file" button.

### Do it all at once
You can create a new device, onboard it, and start sending sensor data all in one command, which is a typical way to use the simulator:
```
npx @nrfcloud/device-simulator-v2 -k <api key> [-d <desired device ID>] -a preconnect -s gps,acc,device,temp
```

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
git add .
git commit -am "<feat|bug|chore|refactor>: <commit message>"

# publish to npm. this will build, ask for a new version, and publish 
# to the npm repo if you run `yarn deploy:beta, it will deploy to the beta tag
yarn deploy[:beta]
# updates the version in the package.json, this line:
#  "version": "2.2.7",

# tag the new version
git tag v2.2.7

# push changes and new tag to github
git push origin HEAD
git push origin v2.2.7
```

## Recipes
See [cli.ts](src/cli.ts) for the options. Most of these are set with environment variables.

### Set up your environment and provision a device

1. Log in to [nrfcloud.com](https://nrfcloud.com) and go to your User Account page and grab your API key. If you are a member of more than one team, be sure to select the team you want to use with the simulator.
2. Install [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html)
3. Set up your environment:

```sh
export API_KEY=<your_api_key>
export API_HOST=<your_api_host, e.g., https://api.nrfcloud.com>
export AWS_REGION=us-east-1 #if your region is different, change it here
# Set a DEVICE_ID environment variable if you want to use a specific device ID. If not, use the following to create a random one.
export DEVICE_RAND=$(node -e 'process.stdout.write(Math.floor(1000000000 + Math.random() * 9000000000).toString())')
export DEVICE_ID=nrfsim-$DEVICE_RAND

4. Run the simulator, which will onboard the device to nRFCloud:
```sh
# Make sure you did not forget to run "yarn build" to generate the dist dir and compiled assets!
node dist/cli.js -a preconnect
```
You should see some JSON output, with something like this at the end:
```sh
************** CONFIG ***********
DEVICE ID: <your_device_id>
MQTT TEAM DEVICE: false
API HOST: https://api.nrfcloud.com
API KEY: <your_api_key>
TEAM ID: <your_team_id>
*********************************

starting simulator...

connecting to "mqtt.nrfcloud.com"...

connected

Initializing nrfsim-201004647211712200000 shadow...

************** MESSAGE SENT ***********
TOPIC: $aws/things/nrfsim-1065144894/shadow/update
MESSAGE: {
  "state": {
    "reported": {
      "connection": {
        "status": "connected",
        "keepalive": 30
      },
      "control": {
        "alertsEn": true,
        "logLvl": 3
      },
      "config": {
        "activeMode": true,
        "locationTimeout": 300,
        "activeWaitTime": 300,
        "movementResolution": 120,
        "movementTimeout": 3600,
        "accThreshAct": 4,
        "accThreshInact": 4,
        "accTimeoutInact": 60,
        "nod": []
      },
      "device": {
        "deviceInfo": {
          "appVersion": "1",
          "batteryVoltage": 5191,
          "appName": "asset_tracker_v2",
          "imei": "358299840010349",
          "board": "nrf9161dk_nrf9161",
          "sdkVer": "v2.6.0-571-gf927cd6b1473",
          "zephyrVer": "v3.5.99-ncs1-4957-g54b4e400ed8f",
          "hwVer": "nRF9161 LACA ADA"
        },
        "networkInfo": {
          "supportedBands": "",
          "networkMode": "LTE-M",
          "ipAddress": "10.160.33.51",
          "ueMode": 2,
          "rsrp": -58
        },
        "simInfo": {
          "uiccMode": 1,
          "iccid": "",
          "imsi": "204080813516718"
        },
        "serviceInfo": {
          "fota_v2": [
            "BOOT",
            "MODEM",
            "APP"
          ]
        },
        "connectionInfo": {
          "protocol": "MQTT",
          "method": "LTE"
        }
      }
    }
  }
}
***************************************

Cannot initialize jobs listener until the device "<your_device_id>" is onboarded to your team. You can onboard the device by running "npx @nrfcloud/device-simulator-v2 -k <api key> -d <your_device_id> -a preconnect".
```

This indicates that the device provisioned with AWS and updated its shadow.

### Associate the device with your team
Note: you will sometimes see `tenantId` in the JSON output. This is the same as `teamId`.

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
confirmed that "<your_device_id>" has been onboarded for team "<your_team_id>"!

listening for new jobs...

************** MESSAGE SENT ***********
TOPIC: dev/<your_team_id>/<your_device_id>/jobs/req
MESSAGE: [
  ""
]
***************************************

subscribed to "dev/<your_team_id>/<your_device_id>/jobs/rcv"
```

Your device is now onboarded with your team and is ready to start sending and receiving device messages! It is also listening for new FOTA jobs. 

### Create a new Firmware Over-the-Air (FOTA) job
1. Open a new terminal window/tab.
2. Set up the environment variables (see above, but use the same `DEVICE_ID` that you had generated).
3. Upload a dummy firmware file as binary data.

>[!NOTE]
>If you don't use the -t (atv2,mss) you won't be able to create an update.

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

### Simulate a FOTA Job Execution Failure Scenario
If you want to test devices failing, stalling, or timing out you can add the `-j` flag with one of the following options:

| Value | Execution Path | Description |
| --- | --- | --- |
| 0 | QUEUED | Simulates a device not being turned on |
| 1 | QUEUED --> REJECTED | Simulates a device instantly rejecting a job |
| 2 | QUEUED --> DOWNLOADING | Simulates a device hanging in the DOWNLOADING state |
| 3 | QUEUED --> DOWNLOADING --> IN_PROGRESS | Simulates a device attempting to update, but is unable to respond |
| 4 | QUEUED --> DOWNLOADING --> IN_PROGRESS --> TIMED_OUT | Simulates a device timing out while processing the update |
| 5 | QUEUED --> DOWNLOADING --> IN_PROGRESS --> FAILED | Simulates a device failing to apply the update and keeping the existing firmware installed |

### Clean up (if desired)

```sh
curl -X DELETE $API_HOST/v1/fota-jobs/<your-jobId> -H "Authorization: Bearer $API_KEY"
curl -X DELETE $API_HOST/v1/firmwares/$BUNDLE_ID -H "Authorization: Bearer $API_KEY"
# $DEVICE_OWNERSHIP_CODE only needed if used a JITP device
curl -X DELETE $API_HOST/v1/devices/$DEVICE_ID -d $DEVICE_OWNERSHIP_CODE -H "Authorization: Bearer $API_KEY" -H "Content-Type: text/plain"
```
