import { $enum } from 'ts-enum-util';

import { NrfDevice } from './Device';
import { Logger } from './Log';

enum FirmwareType {
  APP = 0,
  MODEM = 1,
  BOOT = 2,
}

// enum JobStatus {
//   IN_PROGRESS = 0,
//   CANCELED = 1,
//   DELETION_IN_PROGRESS = 2,
//   COMPLETED = 3,
// }

enum JobExecutionStatus {
  QUEUED = 0,
  IN_PROGRESS = 1,
  FAILED = 2,
  SUCCEEDED = 3,
  TIMED_OUT = 4,
  CANCELED = 5,
  REJECTED = 6,
  DOWNLOADING = 7,
}

type JobId = string;
type FileSize = number;
type Host = string;
type Path = string;

export type Job = [JobId, FirmwareType, FileSize, Host, Path];

export class NrfJobsManager {
  private readonly log: Logger;
  public readonly device: NrfDevice;
  private readonly cache: { [jobId: string]: JobExecutionStatus } = {};

  constructor(device: NrfDevice, log: Logger) {
    this.device = device;
    this.log = log;
  }

  async waitForJobs(): Promise<void> {
    await this.requestLatestQueuedJob();
    await this.setupJobsListener();
  }

  async requestLatestQueuedJob(): Promise<void> {
    return this.device.publish(this.device.topics.jobs.request, ['']);
  }

  async setupJobsListener(): Promise<void> {
    this.device.registerListener(
      this.device.topics.jobs.receive,
      async ({ payload }: { payload: Job }) => {
        if (!payload) {
          return;
        }

        const [jobId, firmwareType, , host, path]: [
          JobId,
          FirmwareType,
          FileSize,
          Host,
          Path,
        ] = payload;

        const prevStatus: JobExecutionStatus = this.cache[jobId] || JobExecutionStatus.QUEUED;
        let newStatus: JobExecutionStatus | undefined = undefined;
        let message: string | undefined = undefined;

        const firmwareTypes: {[key: number]: string} = {};
        $enum(FirmwareType).getEntries().forEach(([key, val]) => firmwareTypes[val] = key);

        const jobExecutionStatuses: {[key: number]: string} = {};
        $enum(JobExecutionStatus).getEntries().forEach(([key, val]) => jobExecutionStatuses[val] = key);

        switch (prevStatus) {
          case JobExecutionStatus.QUEUED:
            message = `downloading "${firmwareTypes[firmwareType]}" firmware file from "${host}${path}"`;
            newStatus = JobExecutionStatus.DOWNLOADING;
            break;

          case JobExecutionStatus.DOWNLOADING:
            message = `installing "${firmwareTypes[firmwareType]}" firmware file from "${host}${path}"`;
            newStatus = JobExecutionStatus.IN_PROGRESS;
            break;

          case JobExecutionStatus.IN_PROGRESS:
            message = `installation sucessful for "${firmwareTypes[firmwareType]}" firmware file from "${host}${path}"`;
            newStatus = JobExecutionStatus.SUCCEEDED;
            break;

          case JobExecutionStatus.SUCCEEDED:
            this.log.success(`job "${jobId}" succeeded!`);
            break;

          case JobExecutionStatus.CANCELED:
            this.log.error(`ERROR: job "${jobId}" was cancelled.`);
            break;

          case JobExecutionStatus.TIMED_OUT:
            this.log.error(`ERROR: job "${jobId}" was timed out.`);
            break;

          case JobExecutionStatus.REJECTED:
            this.log.error(`ERROR: job "${jobId}" was rejected.`);
            break;
        }

        if (message) {
          this.log.info(`
================ ${this.device.id} ================
JOB ID: ${jobId}
OLD STATUS: ${jobExecutionStatuses[prevStatus]} (${prevStatus})
NEW STATUS: ${newStatus ? jobExecutionStatuses[newStatus] : ''} (${newStatus})
MESSAGE: ${message}
================${'='.repeat(this.device.id.length + 2)}================

`);
        }

        if (newStatus) {
          // subscribe to changes
          await this.device.publish(this.device.topics.jobs.request, [jobId]);

          await this.updateJobExecution(jobId, newStatus);
          this.cache[jobId] = newStatus;
        }
      },
    );

    await this.device.subscribe(this.device.topics.jobs.receive);
  }

  async updateJobExecution(
    id: JobId,
    status: JobExecutionStatus,
    message: string = '',
  ): Promise<void> {
    return this.device.publish(this.device.topics.jobs.update, [
      id,
      status,
      message,
    ]);
  }
}
