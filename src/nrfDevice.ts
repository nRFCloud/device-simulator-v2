import { green, yellow, magenta, blue, cyan } from 'colors';
import { device } from 'aws-iot-device-sdk';
import { mqttClient } from './mqttClient';
import { ISensor } from './sensors/Sensor';
import { createService } from './app/services/createService';
import { AppMessage } from './app/appMessage';

export type SendMessage = (timestamp: number, message: AppMessage) => void;

enum JobExecutionStatus {
  QUEUED = 'QUEUED',
  IN_PROGRESS = 'IN_PROGRESS',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  TIMED_OUT = 'TIMED_OUT',
  REJECTED = 'REJECTED',
  REMOVED = 'REMOVED',
  CANCELED = 'CANCELED',
}

enum JobDocumentOperation {
  app_fw_update = 'app_fw_update',
}

type JobDocument = {
  operation: JobDocumentOperation;
  fwversion: string;
  size: number;
  location: string;
};

type JobExecutionState = {
  status: JobExecutionStatus;
  statusDetails: { nextState: DfuStatus };
  versionNumber: number;
};

enum DfuStatus {
  downloadFirmware = 'download_firmware',
  applyUpdate = 'apply_update',
  none = 'none',
}

type JobExecution = {
  jobId: string;
  status: JobExecutionStatus;
  queuedAt: number;
  lastUpdatedAt: number;
  versionNumber: number;
  executionNumber: number;
  jobDocument: JobDocument;
};

export type DeviceConfig = {
  deviceId: string;
  caCert: Buffer | string;
  clientCert: Buffer | string;
  privateKey: Buffer | string;
  endpoint: string;
  appFwVersion: string;
  mqttMessagesPrefix: string;
};

export const nrfdevice = (
  config: DeviceConfig,
  sensors: Map<string, ISensor>,
  onConnect?: (deviceId: string, device: device) => void,
) => {
  const {
    deviceId,
    caCert,
    clientCert,
    privateKey,
    endpoint,
    appFwVersion,
    mqttMessagesPrefix,
  } = config;

  const topics = (deviceId: string) => ({
    jobs: {
      notifyNext: `$aws/things/${deviceId}/jobs/notify-next`,
      update: (jobId: string) => ({
        _: `$aws/things/${deviceId}/jobs/${jobId}/update`,
        accepted: `$aws/things/${deviceId}/jobs/${jobId}/update/accepted`,
      }),
    },
    shadow: {
      update: {
        _: `$aws/things/${deviceId}/shadow/update`,
      },
    },
  });

  console.log({
    deviceId,
    endpoint,
    region: endpoint.split('.')[2],
    topics,
    appFwVersion: parseInt(appFwVersion, 10),
    mqttMessagesPrefix,
  });

  console.log(cyan(`connecting to ${yellow(endpoint)}...`));

  const client = mqttClient({
    id: deviceId,
    caCert,
    clientCert,
    privateKey,
    endpoint,
  });

  client.on('error', (error: any) => {
    console.error(`AWS IoT error ${error.message}`);
  });

  client.on('connect', async () => {
    console.log(green('connected'));

    if (onConnect) {
      onConnect(deviceId, client);
    }

    await waitForJobs(appFwVersion);
  });

  client.on('message', (topic: string, payload: any) => {
    console.log(magenta(`< ${topic}`));
    const p = payload ? JSON.parse(payload.toString()) : {};
    console.log(magenta(`<`));
    console.log(magenta(JSON.stringify(p, null, 2)));

    if (listeners[topic]) {
      listeners[topic]({
        topic,
        payload: p,
      });
    } else {
      throw new Error(`No listener registered for topic ${topic}!`);
    }
  });

  client.on('close', () => {
    console.error('disconnect');
  });

  client.on('reconnect', () => {
    console.log(magenta('reconnect'));
  });

  const publish = (topic: string, payload: object): Promise<void> =>
    new Promise((resolve, reject) => {
      client.publish(topic, JSON.stringify(payload), undefined, error => {
        if (error) {
          return reject(error);
        }
        console.log(cyan(`> ${topic}`));
        console.log(blue(`>`));
        console.log(blue(JSON.stringify(payload, null, 2)));
        return resolve();
      });
    });

  const sendMessage = async (
    timestamp: number,
    payload: object,
  ): Promise<void> => {
    const timeStamp = new Date(timestamp).toISOString();
    console.debug(
      `Timestamp ${timeStamp} and messageId not included in message b/c the fw does not support it yet.`,
    );
    await publish(`${mqttMessagesPrefix}d/${deviceId}/d2c`, payload);
  };

  const subscribe = (topic: string) =>
    new Promise((resolve, reject) => {
      client.subscribe(topic, undefined, (error, granted) => {
        if (error) {
          return reject(error);
        }
        console.log(
          green(
            `subscribed to ${yellow(
              granted.map(({ topic }) => topic).join(', '),
            )}`,
          ),
        );
        return resolve();
      });
    });

  Array.from(sensors.entries()).map(([name, sensor]) =>
    createService(name, sensor, sendMessage).start(),
  );

  const listeners = {} as {
    [key: string]: (args: { topic: string; payload: object }) => void;
  };

  const registerListener = (
    topic: string,
    callback: (args: { topic: string; payload: any }) => void,
  ) => {
    listeners[topic] = callback;
  };

  const unregisterListener = (topic: string) => {
    delete listeners[topic];
  };

  const waitForJobs = async (appFwVersion: string) => {
    await reportAppFirmwareVersion(appFwVersion);
    console.log(green(`reported firmware version ${yellow(appFwVersion)}`));
    const job = await waitForNextUpdateJob();
    console.log(job);
    await acceptJob(job);
  };

  const reportAppFirmwareVersion = async (fwVersion: string) => {
    // Publish firmware version
    await publish(topics(deviceId).shadow.update._, {
      state: {
        reported: {
          nrfcloud__dfu_v1__app_v: fwVersion,
        },
      },
    });
  };

  const waitForNextUpdateJob = (): Promise<JobExecution> =>
    new Promise(resolve => {
      const jobsNextTopic = topics(deviceId).jobs.notifyNext;
      registerListener(jobsNextTopic, ({ payload }) => {
        if (!payload.execution) {
          return;
        }
        unregisterListener(jobsNextTopic);
        resolve(payload.execution as JobExecution);
      });
      return subscribe(jobsNextTopic);
    });

  const updateJob = async (
    job: JobExecution,
    expectedVersion: number,
    nextState: DfuStatus,
    status: JobExecutionStatus,
  ) => {
    await publish(topics(deviceId).jobs.update(job.jobId)._, {
      status,
      statusDetails: {
        nextState,
      },
      expectedVersion,
      includeJobExecutionState: true,
    });
  };

  const updateJobProgress = async (
    job: JobExecution,
    expectedVersion: number,
    nextState: DfuStatus,
  ) => {
    await updateJob(
      job,
      expectedVersion,
      nextState,
      JobExecutionStatus.IN_PROGRESS,
    );
    console.log(
      green(
        `updated job ${yellow(
          job.jobId,
        )} to in progress. nextState: ${nextState}...`,
      ),
    );
  };

  const handleJobUpdateAccepted = (job: JobExecution) => async ({
    payload,
  }: {
    payload: {
      timestamp: number;
      executionState: JobExecutionState;
    };
  }) => {
    console.log('handleJobUpdateAccepted', {
      job,
      payload,
    });
    if (payload.executionState.status !== JobExecutionStatus.IN_PROGRESS) {
      return;
    }
    switch (payload.executionState.statusDetails.nextState) {
      case DfuStatus.downloadFirmware:
        console.log(
          magenta(
            `Skipping downloading the firmware from ${yellow(
              job.jobDocument.location,
            )}...`,
          ),
        );
        await updateJobProgress(
          job,
          payload.executionState.versionNumber,
          DfuStatus.applyUpdate,
        );
        break;
      case DfuStatus.applyUpdate:
        console.log(
          magenta(
            `Skipping applying the firmware update to ${yellow(
              job.jobDocument.fwversion,
            )}...`,
          ),
        );
        await updateJob(
          job,
          payload.executionState.versionNumber,
          DfuStatus.none,
          JobExecutionStatus.SUCCEEDED,
        );
        // handle next job
        await waitForJobs(job.jobDocument.fwversion);
    }
  };

  const acceptJob = async (job: JobExecution) => {
    const jobUpdateAcceptedTopic = topics(deviceId).jobs.update(job.jobId)
      .accepted;
    await subscribe(jobUpdateAcceptedTopic);
    await registerListener(
      jobUpdateAcceptedTopic,
      handleJobUpdateAccepted(job),
    );
    await updateJobProgress(job, job.versionNumber, DfuStatus.downloadFirmware);
  };

  return {
    subscribe,
    publish,
    registerListener,
    unregisterListener,
    run: async (args: { appFwVersion: string }) =>
      waitForJobs(args.appFwVersion),
  };
};
