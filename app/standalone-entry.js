/** One bundle, two contexts: the page boots normally; a Blob worker made from
 * the same inline script installs the rehearsal handler instead. main.js already
 * refuses to boot without a DOM, so the app is not duplicated in the offline file.
 */
import './main.js';
import { installResponseWorker } from './services/responseRehearsal.worker.js';
installResponseWorker();
