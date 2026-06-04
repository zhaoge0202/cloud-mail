export function applyAllEmailSearchType(params, searchType, searchValue) {
	params.userEmail = null;
	params.accountEmail = null;
	params.name = null;
	params.subject = null;
	params.content = null;

	if (searchType === 'user') params.userEmail = searchValue;
	if (searchType === 'account') params.accountEmail = searchValue;
	if (searchType === 'name') params.name = searchValue;
	if (searchType === 'subject') params.subject = searchValue;
	if (searchType === 'content') params.content = searchValue;
}
