export function resolveUnreadValue(type, receiveType, readType) {
	return type === receiveType ? receiveType : readType;
}

export function applyReceiveDefaults(params, receiveType, readType) {
	const emailType = params.type ?? receiveType;
	params.type = emailType;
	params.unread = resolveUnreadValue(emailType, receiveType, readType);
	return params;
}
