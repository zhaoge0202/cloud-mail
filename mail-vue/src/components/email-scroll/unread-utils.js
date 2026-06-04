export function shouldAutoMarkRead(showUnread, unread, unreadValue) {
	return showUnread && unread === unreadValue;
}

export function markEmailListReadLocally(emailList, emailIds, readValue) {
	emailIds.forEach((emailId) => {
		const index = emailList.findIndex((email) => email.emailId === emailId);
		if (index > -1) {
			emailList[index].unread = readValue;
			emailList[index].checked = false;
		}
	});
}

export function markAllEmailListReadLocally(emailList, readValue) {
	emailList.forEach((email) => {
		email.unread = readValue;
		email.checked = false;
	});
}
