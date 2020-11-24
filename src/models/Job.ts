import { yellow, magenta, red } from 'colors';
import { NrfDevice } from './Device';

enum FirmwareType {
  APP = 0,
  MODEM = 1,
  BOOT = 2,
}

enum JobStatus {
  IN_PROGRESS = 0,
  CANCELED = 1,
  DELETION_IN_PROGRESS = 2,
  COMPLETED = 3,
}

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

export type Job = [
  JobId,
  FirmwareType,
  FileSize,
  Host,
  Path,
];

export class NrfJobsManager {
  public readonly device: NrfDevice;
  private readonly cache: {[jobId: string]: JobStatus} = {};

  constructor(device: NrfDevice) {
    this.device = device;
  }

  async waitForJobs(): Promise<void> {
    await this.requestLatestQueuedJob();
    console.log('did request latestQueuedJob');
    await this.setupJobsListener();
  }

  async requestLatestQueuedJob(): Promise<void> {
    return this.device.publish(this.device.topics.jobs.request, ['']);
  }

  async setupJobsListener(): Promise<void> {
    this.device.registerListener(this.device.topics.jobs.receive, async ({payload}: {payload: Job}) => {
      if (!payload) {
        return;
      }

      const [
        jobId,
        ,
        ,
        host,
        path,
      ]: [
        JobId,
        FirmwareType,
        FileSize,
        Host,
        Path,
      ] = payload;

      const currentStatus: JobStatus = this.cache[jobId] || JobStatus.IN_PROGRESS;
      let newStatus: JobStatus|undefined = undefined;

      switch (currentStatus) {
        case JobStatus.IN_PROGRESS:
          console.log(magenta(`Skipping downloading the firmware from ${yellow(`${host}${path}`)}...`));
          newStatus = JobStatus.COMPLETED;
          break;

        case JobStatus.CANCELED:
          console.log(red(`ERROR: Job "${jobId}" was canceled.`));
          break;

        case JobStatus.DELETION_IN_PROGRESS:
          console.log(red(`ERROR: Job "${jobId}" is currently being deleted...`));
          break;

        default:
          console.log(red(`JobStatus of "${status}" not recognized.`));
          break;
      }

      if (newStatus !== undefined) {
        await this.updateJob(jobId, newStatus);
        this.cache[jobId] = newStatus;
      }
    });

    await this.device.subscribe(this.device.topics.jobs.receive);
  }

  async updateJob(id: JobId, status: JobStatus, message: string = ''): Promise<void> {
    return this.device.publish(this.device.topics.jobs.update, [
      id,
      status,
      message,
    ]);
  }
}
