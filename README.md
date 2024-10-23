## nRF91 Device Simulator v2 [![npm version](https://img.shields.io/npm/v/@nrfcloud/device-simulator-v2.svg)](https://www.npmjs.com/package/@nrfcloud/device-simulator-v2)

[![Build Status](https://codebuild.us-east-1.amazonaws.com/badges?uuid=eyJlbmNyeXB0ZWREYXRhIjoiZUVaRWN2MzJDN2ZzTFpUY0diSi80WFB4Qm10cmFIZXFCUU44UXZzaUdVUXRwSERPMFZWdEc3b04zcGlaSWdEMXB3dEZybTlRaERZaWlsRW5rc0RCRVlNPSIsIml2UGFyYW1ldGVyU3BlYyI6InBOZ3FOWjltTVNocUpLYmsiLCJtYXRlcmlhbFNldFNlcmlhbCI6MX0%3D&branch=saga)](https://console.aws.amazon.com/codesuite/codebuild/projects/device-simulator-v2/history?region=us-east-1)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)

This is a software device simulator that shows how to use the [nRF Cloud APIs](https://docs.nordicsemi.com/bundle/nrf-cloud/page/APIs/APIOverview.html) to create device certificates, onboard a device to your team, do Firmware Over-the-Air Updates (FOTA), and more. Although we call it a "simulator", this tool creates real, working IoT "soft devices" that run from your local machine.

## Installation and CLI Help
```
git clone git@github.com:nRFCloud/device-simulator-v2.git 
cd device-simulator-v2
yarn
node dist/cli.js --help
```
Or you can run it directly using [npx](https://docs.npmjs.com/cli/v8/commands/npx):
```
npx @nrfcloud/device-simulator-v2 --help
```
Examples that follow use the `node dist/cli.js` command. If you want nicely formatted JSON output, you can pipe the output to `jq` after [installing it](https://stedolan.github.io/jq/download/).

## Documentation
The [nRF Cloud documentation](https://docs.nordicsemi.com/bundle/nrf-cloud/page/index.html) is a good place to start if you are unfamiliar with the nRF Cloud APIs, types of devices and certificates, device onboarding, and other concepts mentioned in this simulator.

## Basic Usage
You can create a new device, onboard it, and start sending sensor data all in one command, which is a typical way to use the simulator:
```
node dist/cli.js -k <api key> -s gps,acc,temp
```

## Use of simulated sensors
The `-s` flag is optionally used to specify which sensors to simulate.

The `acc` option sends FLIP accelerometer messages, simulating the device being flipped right-side-up or upside-down. This was a feature of the Asset Tracker v1 firmware example that has been removed for the currently supported Asset Tracker v2.

>[!NOTE]
>Including `device` in the list will generate a LOT of device info messages which may overrun your Web browser. Best not to run it more than a few seconds with it, or you can leave out `device` and run it long-term.

If you want to use different GPS data, replace the appropriate file in [./data/sensors](https://github.com/nRFCloud/device-simulator-v2/tree/saga/data/sensors) or change tne appropriate file path(s) in [cli.ts](src/cli.ts). (There is some additional GPS data in this repo for routes around Portland, Oregon, USA.)

GPS data is based on NMEA sentences. If you want to make your own GPS data, go to https://nmeagen.org. The "Multi-point line" seems to work best. Lay some points and then click the "Generate NMEA file" button.

## Create a new Firmware Over-the-Air (FOTA) job
1. Open a new terminal window/tab.
2. Set up the environment variables. Use the same `DEVICE_ID` that you specified or was generated.
3. Upload a dummy firmware file as binary data.

>[!NOTE]
>If you don't use `-a` to specify an app type, you won't be able to create an update.

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
If you want to test devices failing, stalling, or timing out you can add the `-x` flag with one of the following options:

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
