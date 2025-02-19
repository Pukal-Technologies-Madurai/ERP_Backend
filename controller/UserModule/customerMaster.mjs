import sql from 'mssql'
import { servError, dataFound, noData, success, failed, invalidInput } from '../../res.mjs';
import { checkIsNumber } from '../../helper_functions.mjs';


const CustomerMaster = () => {

    const getCustomer = async (req, res) => {
        try {
            const customerGet = `
                SELECT 
                    cus.*, 
                    u.Name AS NameGet, 
                    ut.UserType AS UserTypeGet, 
                    e.Name AS EnteyByGet, 
                    case when cus1.Customer_name is null 
                    then 'Primary' else cus1.Customer_name end as underGet,
                    u.Company_Id,
                    c.Company_Name, 
                    u.BranchId AS Branch_Id,
                    b.BranchName
                FROM tbl_Customer_Master AS cus 
                JOIN tbl_Users as u
                    ON cus.User_Mgt_Id = u.UserId
                JOIN tbl_User_Type as ut
                    ON cus.User_Type_Id = ut.Id
                JOIN tbl_Users as e
                    ON cus.Entry_By = e.UserId
                LEFT JOIN tbl_Customer_Master cus1
                    ON cus.Under_Id = cus1.Cust_Id
                LEFT JOIN tbl_Company_Master c
                    ON c.Company_id = u.Company_Id
                LEFT JOIN tbl_Branch_Master b
                    ON b.BranchId = u.BranchId
                ORDER BY cus.Customer_name ASC`;

            const result = await sql.query(customerGet)
            if (result && result.recordset.length > 0) {
                dataFound(res, result.recordset);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const postCustomer = async (req, res) => {
        const {
            Customer_name, Contact_Person, Mobile_no, Email_Id, Branch_Id, Gstin, User_Type_Id,
            Address1, Address2, Address3, Address4, Pincode, State, Country, Under_Id, Entry_By
        } = req.body;

        if (!Customer_name || !Contact_Person || !Mobile_no || !checkIsNumber(Branch_Id) || !checkIsNumber(User_Type_Id)) {
            return invalidInput(res, 'Customer_name, Contact_Person, Mobile_no, Branch_Id, User_Type_Id is required');
        }

        try {

            // if (Gstin) {
            //     const GstResult = await new sql.Request()
            //         .input('Gstin', Gstin)
            //         .query( `SELECT COUNT(*) AS count FROM tbl_Customer_Master WHERE Gstin = @Gstin`);

            //     if (GstResult.recordset[0].count > 0) {
            //         return failed(res, 'Gstin is Already Exists');
            //     }
            // }
            const checkResult = await new sql.Request()
                .input('Mobile_no', Mobile_no)
                .query(`SELECT UserName from tbl_Users WHERE UserName = @Mobile_no AND UDel_Flag = 0`);

            if (checkResult.recordset.length > 0) {
                return failed(res, 'Mobile Number Already Exists');
            }

            const getCompany = (await new sql.Request()
                .input('branch', Branch_Id)
                .query(`SELECT COALESCE(Company_id, 0) AS Company_id FROM tbl_Branch_Master WHERE BranchId = @branch`)
            ).recordset[0].Company_id;

            if (!checkIsNumber(getCompany) || getCompany === 0) {
                return failed(res, 'Invalid Branch')
            }

            const transaction = await new sql.Transaction().begin();

            try {
                const newuser = new sql.Request(transaction)
                newuser.input('Mode', 1);
                newuser.input('UserId', 0);
                newuser.input('Name', Customer_name);
                newuser.input('UserName', Mobile_no);
                newuser.input('UserTypeId', User_Type_Id);
                newuser.input('Password', '123456');
                newuser.input('BranchId', Branch_Id);
                newuser.input('Company_Id', getCompany);

                const result = await newuser.execute('UsersSP');

                if (result.rowsAffected[0] > 0 && result.recordset.length > 0) {
                    const createdUserId = result.recordset[0][''];

                    const getMaxCustIdQuery = 'SELECT ISNULL(MAX(Cust_Id), 0) + 1 AS NextCustId FROM tbl_Customer_Master';
                    const maxCustIdResult = await sql.query(getMaxCustIdQuery);
                    const nextCustId = maxCustIdResult.recordset[0].NextCustId;


                    let zeros = String(nextCustId).padStart(4, '0');

                    const Cust_No = Branch_Id + '_' + zeros

                    const newCustomer = new sql.Request(transaction)
                        .input('Cust_Id', nextCustId)
                        .input('Cust_No', Cust_No)
                        .input('Customer_name', Customer_name)
                        .input('Contact_Person', Contact_Person)
                        .input('Mobile_no', Mobile_no)
                        .input('Email_Id', Email_Id)
                        .input('Address1', Address1)
                        .input('Address2', Address2)
                        .input('Address3', Address3)
                        .input('Address4', Address4)
                        .input('Pincode', Pincode)
                        .input('State', State)
                        .input('Country', Country)
                        .input('Gstin', Gstin)
                        .input('Under_Id', Under_Id)
                        .input('User_Mgt_Id', createdUserId)
                        .input('User_Type_Id', User_Type_Id)
                        .input('Entry_By', Entry_By)
                        .query(`
                        INSERT INTO tbl_Customer_Master 
                            (Cust_Id, Cust_No, Customer_name, Contact_Person, Mobile_no, Email_Id, Address1, 
                            Address2, Address3, Address4, Pincode, State, Country, Gstin, Under_Id, User_Mgt_Id, 
                            User_Type_Id, Entry_By, Entry_Date)
                        VALUES 
                            (@Cust_Id, @Cust_No, @Customer_name, @Contact_Person, @Mobile_no, @Email_Id, @Address1, 
                            @Address2, @Address3, @Address4, @Pincode, @State, @Country, @Gstin, @Under_Id, @User_Mgt_Id, @User_Type_Id, 
                            @Entry_By, GETDATE()); `)

                    const cuctomerCreateResult = await newCustomer;
                    if (cuctomerCreateResult.rowsAffected[0] > 0) {
                        await transaction.commit();
                        success(res, 'Customer created successfully');
                    } else {
                        await transaction.rollback();
                        failed(res, 'Customer Creation Failed')
                    }
                } else {
                    await transaction.rollback();
                    failed(res, 'User Creation Failed');
                }
            } catch (er) {
                await transaction.rollback();
                servError(er, res);
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const editCustomer = async (req, res) => {

        const {
            Cust_Id, Customer_name, Contact_Person, Mobile_no, Email_Id, Branch_Id, Gstin, User_Type_Id,
            Address1, Address2, Address3, Address4, Pincode, State, Under_Id, User_Mgt_Id
        } = req.body;

        if (!Customer_name || !Contact_Person || !Mobile_no || !checkIsNumber(Branch_Id) || !checkIsNumber(User_Type_Id)) {
            return invalidInput(res, 'Customer_name, Contact_Person, Mobile_no, Branch_Id, User_Type_Id is required');
        }

        try {

            // if (Gstin) {
            //     const GstResult = await new sql.Request()
            //         .input('Gstin', Gstin)
            //         .input('Cust_Id', Cust_Id)
            //         .query( `SELECT COUNT(*) AS count FROM tbl_Customer_Master WHERE Gstin = @Gstin AND Cust_Id != @Cust_Id`);

            //     if (GstResult.recordset[0].count > 0) {
            //         return failed(res, 'Gstin is Already Exists');
            //     }
            // }

            const checkResult = await new sql.Request()
                .input('Mobile_no', Mobile_no)
                .input('UserId', User_Mgt_Id)
                .query(`SELECT UserName FROM tbl_Users WHERE UserName = @Mobile_no AND UDel_Flag = 0 AND UserId != @UserId; `);

            if (checkResult.recordset.length > 0) {
                return failed(res, 'Mobile Number Already Exists');
            }

            const passwordResult = await new sql.Request()
                .input('User_Mgt_Id', User_Mgt_Id)
                .query('SELECT Password from tbl_Users WHERE UserId = @User_Mgt_Id');

            const Password = passwordResult.recordset[0].Password;

            const getCompany = (await new sql.Request()
                .input('branch', Branch_Id)
                .query(`SELECT COALESCE(Company_id, 0) AS Company_id FROM tbl_Branch_Master WHERE BranchId = @branch`)
            ).recordset[0].Company_id;

            if (!checkIsNumber(getCompany) || getCompany === 0) {
                return failed(res, 'Invalid Branch')
            }

            const transaction = await new sql.Transaction().begin();

            try {
                const newuser = new sql.Request(transaction)
                    .input('Mode', 2)
                    .input('UserId', User_Mgt_Id)
                    .input('Name', Customer_name)
                    .input('UserName', Mobile_no)
                    .input('UserTypeId', User_Type_Id)
                    .input('Password', Password)
                    .input('BranchId', Branch_Id)
                    .input('Company_Id', getCompany)
                    .execute('UsersSP')

                const result = await newuser;

                if (result.recordset.length > 0) {

                    const newCustomer = new sql.Request(transaction)
                        .input('Customer_name', Customer_name)
                        .input('Mobile_no', Mobile_no)
                        .input('UserTypeId', User_Type_Id)
                        .input('Contact_Person', Contact_Person)
                        .input('Email_Id', Email_Id)
                        .input('Gstin', Gstin)
                        .input('UnderId', Under_Id)
                        .input('Pincode', Pincode)
                        .input('State', State)
                        .input('Address1', Address1)
                        .input('Address2', Address2)
                        .input('Address3', Address3)
                        .input('Address4', Address4)
                        .input('Cust_Id', Cust_Id)
                        .query(`
                            UPDATE tbl_Customer_Master 
                            SET 
                                Customer_name = @Customer_name,
                                Mobile_no = @Mobile_no,
                                User_Type_Id = @UserTypeId,
                                Contact_Person = @Contact_Person,
                                Email_Id = @Email_Id,
                                Gstin = @Gstin,
                                Under_Id = @UnderId,
                                Pincode = @Pincode,
                                State = @State,
                                Address1 = @Address1,
                                Address2 = @Address2,
                                Address3 = @Address3,
                                Address4 = @Address4
                            WHERE Cust_Id = @Cust_Id`);

                    const cuctomerUpdateResult = await newCustomer;

                    if (cuctomerUpdateResult.rowsAffected[0] > 0) {
                        await transaction.commit();
                        success(res, 'Changes Saved');
                    } else {
                        await transaction.rollback();
                        failed(res, 'Failed to Save');
                    }

                } else {
                    await transaction.rollback();
                    failed(res, 'User Update Failed');
                }
            } catch (er) {
                await transaction.rollback();
                servError(er, res);
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const isCustomer = async (req, res) => {
        const { UserId } = req.query;

        try {
            if (!checkIsNumber(UserId)) {
                return invalidInput(res, 'UserId is Required');
            }

            const result = await new sql.Request()
                .input('UserId', UserId)
                .query(`SELECT Cust_Id FROM tbl_Customer_Master WHERE User_Mgt_Id = @UserId`);

            if (result.recordset.length === 0) {
                res.status(200).json({ data: [], success: false, message: 'Not a Customer', isCustomer: false });
            } else {
                res.status(200).json({ data: result.recordset, success: true, message: 'Customer Found', isCustomer: true });
            }

        } catch (e) {
            servError(e, res);
        }
    }

    // get('/api/BankDetails' )

    const BankDetails = async (req, res) => {
        // const { CompanyId } = req.query;

        // if (isNaN(CompanyId)) {
        //     return invalidInput(res, 'CompanyId is required');
        // }

        try {
            // const result = await sql.query(`SELECT * FROM tbl_Bank_Details WHERE isActive = 1 AND Company_Id = '${CompanyId}'`);
            const result = await sql.query(`SELECT * FROM tbl_Bank_Details WHERE isActive = 1`);

            if (result.recordset.length) {
                dataFound(res, result.recordset);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res)
        }
    }


    return {
        getCustomer,
        postCustomer,
        editCustomer,
        isCustomer,
        BankDetails,
    }
}

export default CustomerMaster()