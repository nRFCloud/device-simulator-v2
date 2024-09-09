import { ISensor } from '../../sensors/Sensor';
import { SendMessage } from '../../nrfDevice';
import { Service } from './Service';
import { Gps } from './Gps';
import { Temp } from './Temperature';
import { Flip } from './Flip';
import { Device } from './Device';
import { Rsrp } from './Rsrp';
import { Location } from './Location';
import { Alert } from './Alert';
import { Log } from './Log';
import { Gnss } from './Gnss';

interface ServiceConstructors {
	[index: string]: new (sensor: ISensor, sendMessage: SendMessage) => Service;
}

const services: ServiceConstructors = {
	acc: Flip,
	gps: Gps,
	gnss: Gnss,
	temp: Temp,
	device: Device,
	rsrp: Rsrp,
	location: Location,
	alert: Alert,
	log: Log,
};

export const createService = (
	name: string,
	sensor: ISensor,
	sendMessage: SendMessage,
): Service => {
	const Service = services[name];
	if (Service == null) {
		throw new Error(`No service for a sensor named '${name}' is known.`);
	}

	return new Service(sensor, sendMessage);
};
