import { leaveRead } from '@/lib/leave-desk/server';
export async function GET(){return leaveRead('leave_insights');}
