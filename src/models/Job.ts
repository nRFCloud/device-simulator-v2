import { yellow, magenta, red } from 'colors';
import { NrfDevice } from './Device';

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
  public readonly device: NrfDevice;
  private readonly cache: { [jobId: string]: JobExecutionStatus } = {};

  constructor(device: NrfDevice) {
    this.device = device;
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

        const currentStatus: JobExecutionStatus =
          this.cache[jobId] || JobExecutionStatus.QUEUED;
        let newStatus: JobExecutionStatus | undefined = undefined;

        switch (currentStatus) {
          case JobExecutionStatus.QUEUED:
            console.log(
              magenta(
                `downloading ${yellow(
                  `"${firmwareType}"`,
                )} firmware file from ${yellow(`"${host}${path}"`)}`,
              ),
            );
            newStatus = JobExecutionStatus.DOWNLOADING;
            break;

          case JobExecutionStatus.DOWNLOADING:
            console.log(
              magenta(
                `installing ${yellow(
                  `"${firmwareType}"`,
                )} firmware file from ${yellow(`"${host}${path}"`)}`,
              ),
            );
            newStatus = JobExecutionStatus.IN_PROGRESS;
            break;

          case JobExecutionStatus.IN_PROGRESS:
            console.log(
              magenta(
                `installation sucessful for ${yellow(
                  `"${firmwareType}"`,
                )} firmware file from ${yellow(`"${host}${path}"`)}`,
              ),
            );
            newStatus = JobExecutionStatus.SUCCEEDED;
            break;

          case JobExecutionStatus.CANCELED:
            console.log(red(`ERROR: jobId ${jobId} was cancelled.`));
            break;

          case JobExecutionStatus.CANCELED:
            console.log(red(`ERROR: jobId ${jobId} was cancelled.`));
            break;

          case JobExecutionStatus.TIMED_OUT:
            console.log(red(`ERROR: jobId ${jobId} has timed out.`));
            break;

          case JobExecutionStatus.REJECTED:
            console.log(red(`ERROR: jobId ${jobId} was rejected.`));
            break;
        }

        if (newStatus !== undefined) {
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
