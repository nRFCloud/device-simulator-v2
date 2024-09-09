import { EventEmitter } from 'events';
import { ISensor } from './Sensor';
import * as fs from 'fs';

export class FakeGnss extends EventEmitter implements ISensor {

	private readonly GnssSentences: Object[] = [];
	private sentenceIndex: number = 0;
	private started = false;
	private GnssEmitterIntervalId: any = null;

	constructor(
		private readonly gnssReading: string,
		private readonly loop: boolean = false,
		private readonly defaultSampleRate: number,
	) {
		super();
	}

	private readGnssData() {
		const data = require(this.gnssReading);
		this.GnssSentences.push(...data);
		this.cleanUpAndStartEmitting();
	}


	private emitGnssData() {

		this.emit(
			'data',
			Date.now(),
			this.GnssSentences[this.sentenceIndex]
		);

		if (this.sentenceIndex === this.GnssSentences.length - 1) {
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
			fs.exists(this.gnssReading, resolve),
		);

		if (!fileExists) {
			throw new Error(
				`Recording with filename '${this.gnssReading}' does not exist.`,
			);
		}

		this.started = true;

		this.readGnssData();
	}

	private cleanUpAndStartEmitting() {
		if (this.GnssSentences) {
			this.GnssEmitterIntervalId = setInterval(() => {
				this.emitGnssData();
			}, this.defaultSampleRate);
		}
	}

	stop() {
		clearInterval(this.GnssEmitterIntervalId);
		this.started = false;
		this.emit('stopped');
	}

	isStarted(): boolean {
		return this.started;
	}
}