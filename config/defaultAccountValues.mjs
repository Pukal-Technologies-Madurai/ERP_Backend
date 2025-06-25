export const CGST_Acc_Id = 2090;
export const SGST_Acc_Id = 2091;
export const IGST_Acc_Id = 4942;
export const Round_off_Acc_Id = 129;

export const defaultAccountAsArray = [
    { id: CGST_Acc_Id, valueFor: 'CGST' },
    { id: SGST_Acc_Id, valueFor: 'SGST' },
    { id: IGST_Acc_Id, valueFor: 'IGST' },
    { id: Round_off_Acc_Id, valueFor: 'Round_off' },
].filter(fil => fil.id !== 0);

export const defaultAccountId = [
    CGST_Acc_Id,
    SGST_Acc_Id,
    IGST_Acc_Id,
    Round_off_Acc_Id
].filter(fil => fil !== 0);