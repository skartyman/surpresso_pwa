/** @typedef {{ id:string, telegramUserId:number, companyName:string, managerName:string, createdAt:string }} Client */
/** @typedef {{ id:string, clientId:string, model:string, serialNumber:string, internalNumber:string, status:'active'|'service_required'|'inactive', serviceHistory:Array<{id:string,date:string,action:string}> }} Equipment */
/** @typedef {{ id:string, clientId:string, equipmentId:string, category:string, description:string, urgency:'low'|'normal'|'high'|'critical', canOperate:boolean, media:Array<{id:string,url:string,type:'image'|'video'}>, status:'new'|'in_progress'|'resolved'|'closed', createdAt:string, updatedAt:string }} ServiceRequest */
/** @typedef {{ id:string, clientId:string, equipmentId:string, status:string, startedAt:string, expiresAt:string }} RentalContract */
/** @typedef {{ id:string, clientId:string, status:string, items:Array<{sku:string,qty:number}>, createdAt:string }} ProductOrder */
/** @typedef {{ id:string, clientId:string, managerId:string, status:'open'|'closed', createdAt:string }} SupportThread */
