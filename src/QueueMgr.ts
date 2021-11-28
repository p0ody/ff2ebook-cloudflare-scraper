import { v4 as uuidv4 } from 'uuid';

interface Entry {
	id: string
	data: any
}

export class QueueMgr {
	private queue: Array<Entry>;
	constructor() {
		this.queue = [];
	}

	/**
	 * Push data to the end of queue and return ID
	 * @param data 
	 * @returns number
	 */
	push(data: any) : string {
		let id = uuidv4();
		let len = this.queue.push({ id: id, data: data });
		return id;
	}

	pull(): Entry {
		return this.queue.splice(0, 1)[0];
	}

	get complete(): Array<Entry> {
		return this.queue;
	}

	get isEmpty(): boolean {
		return !(this.queue.length > 0);
	}

	get next(): Entry {
		return this.queue[0];
	}
}
