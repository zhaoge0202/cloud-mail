export function calculateWidthScale(parentWidth, childWidth) {
	if (!childWidth) {
		return null;
	}

	return parentWidth / childWidth;
}
