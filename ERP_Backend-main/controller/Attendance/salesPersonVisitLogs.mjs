import sql from 'mssql';
import { dataFound, failed, invalidInput, noData, servError, success } from '../../res.mjs'
import uploadFile from '../../middleware/uploadMiddleware.mjs';
import getImage from '../../middleware/getImageIfExist.mjs';
import { checkIsNumber } from '../../helper_functions.mjs';


const VisitLogs = () => {

    const postVisitLogs = async (req, res) => {

        try {

            await uploadFile(req, res, 3, 'Location_Image');
            const fileName = req?.file?.filename || null;
            const filePath = req?.file?.path || null;
            const filetype = req?.file?.mimetype || null;
            const filesize = req?.file?.size || null;

            const { Mode } = req.body;

            if (!checkIsNumber(Mode) || (Number(Mode) !== 1 && Number(Mode) !== 2)) {
                return invalidInput(res, 'Valid API Mode is required');
            }

            const { Retailer_Id, Reatailer_Name, Contact_Person, Contact_Mobile, Location_Address, Latitude, Longitude, Narration, EntryBy } = req.body;

            if (Number(Mode) === 1 && (!checkIsNumber(Retailer_Id) || !Latitude || !Longitude || !checkIsNumber(EntryBy))) {
                return invalidInput(res, 'Retailer_Id, Latitude, Longitude, EntryBy is required');
            }

            if (Number(Mode) === 2 && (!Reatailer_Name || !Contact_Person || !Contact_Mobile || !Latitude || !Longitude || !checkIsNumber(EntryBy))) {
                return invalidInput(res, 'Reatailer_Name, Contact_Person, Contact_Mobile, Latitude, Longitude, EntryBy is required');
            }

            const query = `
            INSERT INTO tbl_Daily_Call_Log
                (Retailer_Id, Reatailer_Name, Contact_Person, Contact_Mobile, Location_Address, Latitude, Longitude, Narration, EntryBy, EntryAt, ImageName, ImagePath, ImageType, ImageSize, IsExistingRetailer)
            VALUES
                (@id, @name, @con_per, @con_mob, @add, @lat, @long, @nar, @enter, @enter_at, @img_name, @img_path, @img_type, @img_size, @exist)`;

            const request = new sql.Request()

            if (Number(Mode) === 1) {

                const getRetailer = await new sql.Request().input('Retailer_Id', Retailer_Id).query(`
                SELECT 
                    Retailer_Name, 
                    Contact_Person, 
                    Mobile_No, 
                    Reatailer_Address 
                FROM 
                    tbl_Retailers_Master 
                WHERE 
                    Retailer_Id = @Retailer_Id`)

                if (getRetailer.recordset.length === 0) {
                    return failed(res, 'Retailer Not Found');
                }

                const RetailerInfo = getRetailer.recordset[0];

                request.input('id', Retailer_Id);
                request.input('name', RetailerInfo?.Retailer_Name);
                request.input('con_per', RetailerInfo?.Contact_Person);
                request.input('con_mob', RetailerInfo?.Mobile_No);
                request.input('add', RetailerInfo?.Reatailer_Address);
                request.input('exist', 1);
            }

            if (Number(Mode) === 2) {
                request.input('id', null);
                request.input('name', Reatailer_Name);
                request.input('con_per', Contact_Person);
                request.input('con_mob', Contact_Mobile);
                request.input('add', Location_Address);
                request.input('exist', 0);
            }

            request.input('lat', Latitude);
            request.input('long', Longitude);
            request.input('nar', Narration);
            request.input('enter', EntryBy);
            request.input('enter_at', new Date());
            request.input('img_name', fileName);
            request.input('img_path', filePath);
            request.input('img_type', filetype);
            request.input('img_size', filesize);

            const result = await request.query(query);

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {
                success(res, 'Data Saved!')
            } else {
                failed(res, 'Failed to Save, Try again later')
            }

        } catch (e) {
            servError(e, res);
        }
    }

    const getVisitedLogs = async (req, res) => {
        const { reqDate, UserId } = req.query;

        try {
            let query = `
            SELECT
            	logs.*,
            	COALESCE((
            		SELECT
            			Name
            		FROM
            			tbl_Users
            		WHERE
            			UserId = logs.EntryBy
            	), 'NOT FOUND') AS EntryByGet
            FROM
            	tbl_Daily_Call_Log AS logs
            WHERE 
                CONVERT(DATE, logs.EntryAt) = CONVERT(DATE, @reqDate)`;

            if (checkIsNumber(UserId)) {
                query += `AND logs.EntryBy = @entry`
            }

            
            const request = new sql.Request();
            request.input('reqDate', reqDate || new Date());
            request.input('entry', UserId);

            const result = await request.query(query);

            if (result.recordset.length > 0) {
                const withImage = result.recordset.map(o => ({
                    ...o,
                    imageUrl: getImage('visitLogs', o?.ImageName)
                }));
                dataFound(res, withImage)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    return {
        postVisitLogs,
        getVisitedLogs,
    }
}

export default VisitLogs()