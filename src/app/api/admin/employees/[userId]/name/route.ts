import {NextResponse} from 'next/server';
import {z} from 'zod';
import {employeeMutation} from '@/lib/employee/server';
import {nameSchema} from '@/lib/profile/name';
export async function PATCH(request:Request,{params}:{params:Promise<{userId:string}>}){
 const {userId}=await params;
 if(!z.uuid().safeParse(userId).success)return NextResponse.json({error:'Invalid user ID'},{status:400});
 return employeeMutation(request,nameSchema,'profile_admin_correct_name',value=>({p_user:userId,p_first:value.firstName,p_last:value.lastName||null}));
}
