export interface CustomerDraft {
  name: string;
  mobile: string;
  email: string;
  gstin: string;
  stateCode: string;
  line1: string;
  line2: string;
  city: string;
  pincode: string;
  sameAsBilling: boolean;
  shipLine1: string;
  shipLine2: string;
  shipCity: string;
  shipPincode: string;
  shipStateCode: string;
}

export function emptyCustomer(stateCode = ''): CustomerDraft {
  return {
    name: '',
    mobile: '',
    email: '',
    gstin: '',
    stateCode,
    line1: '',
    line2: '',
    city: '',
    pincode: '',
    sameAsBilling: true,
    shipLine1: '',
    shipLine2: '',
    shipCity: '',
    shipPincode: '',
    shipStateCode: '',
  };
}

export function customerPayload(draft: CustomerDraft) {
  return {
    name: draft.name,
    mobile: draft.mobile,
    email: draft.email,
    gstin: draft.gstin,
    stateCode: draft.stateCode,
    billingAddress: {
      line1: draft.line1,
      line2: draft.line2,
      city: draft.city,
      pincode: draft.pincode,
    },
    sameAsBilling: draft.sameAsBilling,
    shippingAddress: draft.sameAsBilling
      ? null
      : {
          line1: draft.shipLine1,
          line2: draft.shipLine2,
          city: draft.shipCity,
          pincode: draft.shipPincode,
          stateCode: draft.shipStateCode,
        },
  };
}
