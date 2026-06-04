export function resolveUnreadValue(type, receiveType, readType) {
	return type === receiveType ? receiveType : readType;
}
