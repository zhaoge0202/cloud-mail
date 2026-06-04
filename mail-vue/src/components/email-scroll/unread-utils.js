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
