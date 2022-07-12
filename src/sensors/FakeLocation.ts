import { EventEmitter } from 'events';
import { ISensor } from './Sensor';
import * as fs from 'fs';

export class FakeLocation extends EventEmitter implements ISensor {

	private readonly LocationSentences: Object[] = [];
	private sentenceIndex: number = 0;
	private started = false;
	private locationEmitterIntervalId: any = null;

	constructor(
		private readonly locationReading: string,
		private readonly loop: boolean = false,
	) {
		super();
	}

	private readLocationData() {
		const data = JSON.parse(fs.readFileSync(this.locationReading, 'utf8'));
		this.LocationSentences.push(...data.locations);
		this.cleanUpAndStartEmitting();
	}


	private emitGPSData() {

		this.emit(
			'data',
			Date.now(),
			this.LocationSentences[this.sentenceIndex]
		);

		if (this.sentenceIndex === this.LocationSentences.length - 1) {
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
			fs.exists(this.locationReading, resolve),
		);

		if (!fileExists) {
			throw new Error(
				`Recording with filename '${this.locationReading}' does not exist.`,
			);
		}

		this.started = true;

		this.readLocationData();
	}

	private cleanUpAndStartEmitting() {
		if (this.LocationSentences) {
			this.locationEmitterIntervalId = setInterval(() => {
				this.emitGPSData();
			}, 3000);
		}
	}

	stop() {
		clearInterval(this.locationEmitterIntervalId);
		this.started = false;
		this.emit('stopped');
	}

	isStarted(): boolean {
		return this.started;
	}
}