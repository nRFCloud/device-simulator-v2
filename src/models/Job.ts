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

enum JobExecutionPath {
	Ignore = 0,
	Reject = 1,
	DownloadHang = 2,
	DownloadInProgress = 3,
	DownloadTimeout = 4,
}

const getExecutionPath = (path: JobExecutionPath): JobExecutionStatus[] => {
	return $enum.mapValue(path).with({
		[JobExecutionPath.Ignore]: [JobExecutionStatus.QUEUED],
		[JobExecutionPath.Reject]: [JobExecutionStatus.QUEUED, JobExecutionStatus.REJECTED],
		[JobExecutionPath.DownloadHang]: [JobExecutionStatus.QUEUED, JobExecutionStatus.DOWNLOADING],
		[JobExecutionPath.DownloadInProgress]: [JobExecutionStatus.QUEUED, JobExecutionStatus.DOWNLOADING, JobExecutionStatus.IN_PROGRESS],
		[JobExecutionPath.DownloadTimeout]: [JobExecutionStatus.QUEUED, JobExecutionStatus.DOWNLOADING, JobExecutionStatus.IN_PROGRESS, JobExecutionStatus.TIMED_OUT],
	})
}

const getPathName = (path: JobExecutionPath): string => {
	return $enum.mapValue(path).with({
		[JobExecutionPath.Ignore]: 'Ignore Job',
		[JobExecutionPath.Reject]: 'Reject Job',
		[JobExecutionPath.DownloadHang]: 'Hang on DOWNLOADING state',
		[JobExecutionPath.DownloadInProgress]: 'Hang on IN_PROGRESS state',
		[JobExecutionPath.DownloadTimeout]: 'End with a TIME_OUT',
		[$enum.handleUnexpected]: 'Normal',
	})
}

const getNextExecutionStatus = (pathType: JobExecutionPath, currentStatus: JobExecutionStatus): JobExecutionStatus => {
	const path = getExecutionPath(pathType);
	const currentStep = path.indexOf(currentStatus);

	if (currentStep === -1) {
		return path[0];
	}

	return path[currentStep + 1] ?? '';
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
	private readonly path: any;
	private didSendInitialJobRequest: boolean = false;

	constructor(device: NrfDevice, log: Logger, path: any) {
		this.device = device;
		this.log = log;
		this.path = path;
	}

	async waitForJobs(): Promise<void> {
		await this.requestLatestQueuedJob();
		await this.setupJobsListener();
	}

	async requestLatestQueuedJob(): Promise<void> {
		if (this.didSendInitialJobRequest) {
			this.log.debug('Already sent initial job request. Not sending another...');
			return;
		}

		await this.device.publish(this.device.topics.jobs.request, ['']);
		this.didSendInitialJobRequest = true;
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

				const firmwareTypes: { [key: number]: string } = {};
				$enum(FirmwareType).getEntries().forEach(([key, val]) => firmwareTypes[val] = key);

				const jobExecutionStatuses: { [key: number]: string } = {};
				$enum(JobExecutionStatus).getEntries().forEach(([key, val]) => jobExecutionStatuses[val] = key);

				switch (prevStatus) {
					case JobExecutionStatus.QUEUED:
						message = `downloading "${firmwareTypes[firmwareType]}" firmware file from "${host}${path}"`;
						newStatus = this.path ? getNextExecutionStatus(this.path, prevStatus) : JobExecutionStatus.DOWNLOADING;
						break;

					case JobExecutionStatus.DOWNLOADING:
						message = `installing "${firmwareTypes[firmwareType]}" firmware file from "${host}${path}"`;
						newStatus = this.path ? getNextExecutionStatus(this.path, prevStatus) : JobExecutionStatus.IN_PROGRESS;
						break;

					case JobExecutionStatus.IN_PROGRESS:
						message = `installation successful for "${firmwareTypes[firmwareType]}" firmware file from "${host}${path}"`;
						newStatus = this.path ? getNextExecutionStatus(this.path, prevStatus) : JobExecutionStatus.SUCCEEDED;
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

				if (newStatus) {
					// subscribe to changes
					this.log.info('Subscribing to jobExecution updates...');
					await this.device.publish(this.device.topics.jobs.request, [jobId]);

					// update jobExecution status
					this.log.info(`Updating jobExecution "${jobId}"...`);
					await this.updateJobExecution(jobId, newStatus);
					this.cache[jobId] = newStatus;
				}

				if (message) {
					this.log.info(this.log.prettify(this.device.id, [
						['JOB ID', jobId],
						['OLD STATUS', `${jobExecutionStatuses[prevStatus]} (${prevStatus})`],
						['NEW STATUS', `${newStatus ? jobExecutionStatuses[newStatus] : ''} (${newStatus ?? ''})`],
						['MESSAGE', message],
						['JOB EXECUTION PATH', getPathName(this.path)]
					]));
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
