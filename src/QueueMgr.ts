import { getLogger } from 'loglevel';
import { v4 as uuidv4 } from 'uuid';
import { Config } from '../conf/config';

interface QueueElement {
	id: string,
	fn: Function,
	result: any,
	done: boolean,
}

export class QueueMgr {
	private queue: Array<QueueElement>;
	private inProgress: Array<QueueElement>;
	private maxAsync: number;
	constructor(maxAsync: number = 100) {
		this.queue = [];
		this.inProgress = [];
		this.maxAsync = maxAsync;

		setInterval(this.loop.bind(this), Config.ScraperMgr.LOOP_INTERVAL_MS);
	}

	push(fn: Function) : string {
		let id = uuidv4();
		this.queue.push({ 
			id: id, 
			fn: fn, 
			result: null, 
			done: false });
		return id;
	}

	get complete(): Array<QueueElement> {
		return this.queue;
	}

	get isEmpty(): boolean {
		return this.queue.length == 0;
	}

	get next(): QueueElement {
		return this.queue.shift();
	}

	private async loop() {
		if (this.inProgress.length >= this.maxAsync) {
			return;
		}

		let element = this.next;

		if (!element) {
			return;
		}
		await this.setInProgress(element, true);
		element.result = await element.fn();
		element.done = true; 
		await this.setInProgress(element, false);
	}
	
	async waitFor(id: string): Promise<any> {
		let waitFor: QueueElement | null = null;

		for (let element of this.queue) {
			if (element.id == id) {
				waitFor = element;
				break;
			}
		}

		if (!waitFor) {
			return null;
		}

		while (!waitFor.done) {
			await this.delay(Config.ScraperMgr.LOOP_INTERVAL_MS);
			// Wait until the function is done executing
		} 
		
		return waitFor.result;
	}

	private async delay(ms: number) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	private async setInProgress(element:QueueElement, inProgress: boolean) {
		if (inProgress) {
			this.inProgress.push(element);
			return;
		}

		let index = this.inProgress.indexOf(element);

		if (index !== -1) {
			this.inProgress.splice(index, 1);
		}

	}
}
