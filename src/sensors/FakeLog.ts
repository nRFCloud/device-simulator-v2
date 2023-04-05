import { EventEmitter } from 'events';
import { ISensor } from './Sensor';
import * as fs from 'fs';


export class FakeLog extends EventEmitter implements ISensor {

	private readonly logSentences: Object[] = [];
	private sentenceIndex: number = 0;
	private started = false;
	private logEmitterIntervalId: any = null;

	constructor(
		private readonly logReading: string,
		private readonly loop: boolean = false,
		private readonly defaultSampleRate: number,
	) {
		super();
	}

	private readLogData() {
		const data = JSON.parse(fs.readFileSync(this.logReading, 'utf8'));
		this.logSentences.push(...data.logs);
		this.cleanUpAndStartEmitting();
	}


	private emitLogData() {

		this.emit(
			'data',
			Date.now(),
			this.logSentences[this.sentenceIndex]
		);

		if (this.sentenceIndex === this.logSentences.length - 1) {
			if (this.loop) {
				this.sentenceIndex = 0;
			} else {
				this.stop();
			}
		} else {
			this.sentenceIndex++;
		}
	}

	async start(): Promise<void> {
		const fileExists = await new Promise(resolve =>
			fs.exists(this.logReading, resolve),
		);

		if (!fileExists) {
			throw new Error(
				`Recording with filename '${this.logReading}' does not exist.`,
			);
		}

		this.started = true;

		this.readLogData();
	}

	private cleanUpAndStartEmitting() {
		if (this.logSentences) {
			this.logEmitterIntervalId = setInterval(() => {
				this.emitLogData();
			}, this.defaultSampleRate);
		}
	}

	stop() {
		clearInterval(this.logEmitterIntervalId);
		this.started = false;
		this.emit('stopped');
	}

	isStarted(): boolean {
		return this.started;
	}
}