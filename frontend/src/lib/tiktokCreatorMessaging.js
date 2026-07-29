const FIVE_MESSAGES_BEFORE_RESPONSE = 'im_threshold_seller_five_before_respond';

export const isCreatorMessagingNotice = (value) => (
  String(value || '').toLowerCase().includes(FIVE_MESSAGES_BEFORE_RESPONSE)
);

export const creatorMessagingText = (value, t) => {
  const message = String(value || '');
  if (isCreatorMessagingNotice(message)) {
    return t('sellerAffiliate.messageFiveBeforeResponse');
  }
  return message;
};

export const creatorMessagingErrorText = (error, t) => {
  return creatorMessagingText(error?.message || error, t);
};
