import { handlePilotRequest } from './handler';

export const dynamic = 'force-dynamic';

export const POST = (req: Request) => handlePilotRequest(req);
