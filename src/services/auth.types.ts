export type RegisterInput = {
  fullName: string;
  mobileNumber: string;
  email: string;
  password: string;
  organization: {
    name: string;
    businessType: string;
    contactNumber: string;
    email: string;
    website?: string | null;
    addressLine1: string;
    addressLine2?: string | null;
    city: string;
    state: string;
    country: string;
    pincode: string;
  };
};
