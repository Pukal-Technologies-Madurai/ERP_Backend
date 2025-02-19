import sql from 'mssql'
import { servError, dataFound, noData, success, failed, invalidInput } from '../../res.mjs';
import { ISOString, checkIsNumber } from '../../helper_functions.mjs';

const dataEntryAttendance = () => {

    const getAttendance = async (req, res) => {
        const { Fromdate, Todate, reqLocation } = req.query;

        if (!reqLocation) {
            return invalidInput(res, 'reqLocation is required');
        }

        try {
            const getRequest = new sql.Request()
                .input('Fromdate', sql.Date, Fromdate ? ISOString(Fromdate) : ISOString())
                .input('Todate', sql.Date, Todate ? ISOString(Todate) : ISOString())
                .input('LocationDetails', sql.NVarChar(50), reqLocation)
                .query(`
                    WITH UWORK AS (
                        SELECT 
                            DISTINCT WorkDetails
                        FROM
                            tbl_Data_Entry_Attendance
                        WHERE
                            EntryDate >= @Fromdate
                            AND
                            EntryDate <= @Todate
                            AND
                            LocationDetails = @LocationDetails
                    ),
                    StaffDetails AS (
                        SELECT
                            *
                        FROM
                            tbl_Data_Entry_Attendance
                        WHERE
                            EntryDate >= @Fromdate
                            AND
                            EntryDate <= @Todate
                            AND
                            LocationDetails = @LocationDetails
                    )
                    SELECT 
                        DISTINCT ut.EntryDate,
                        COALESCE((
                            SELECT 
                                c.WorkDetails,
                                COALESCE((
                                    SELECT
                                        DISTINCT s.StaffType,
                    					COALESCE((
                    						SELECT
                    							TOP (1) e.*
                    						FROM
                    							StaffDetails AS e
                    						WHERE
                    							e.EntryDate = ut.EntryDate
                    							AND
                    							e.WorkDetails = c.WorkDetails
                    							AND
                    							e.StaffType = s.StaffType
                    						FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
                    					), '{}') AS StaffAttendance
                                    FROM
                                        StaffDetails AS s
                                    WHERE
                                        s.WorkDetails = c.WorkDetails
                                    FOR JSON PATH
                                ), '[]') AS StaffTypes
                            FROM
                                UWORK c
                            FOR JSON PATH
                        ), '[]') AS Categories
                    FROM
                        tbl_Data_Entry_Attendance AS ut
                    WHERE
                        ut.EntryDate >= @Fromdate
                        AND
                        ut.EntryDate <= @Todate
                        AND
                        ut.LocationDetails = @LocationDetails
                    ORDER BY
                        ut.EntryDate DESC;



                    SELECT
                        DISTINCT WorkDetails
                    FROM
                        tbl_Data_Entry_Attendance;


                    SELECT
                        DISTINCT StaffType
                    FROM
                        tbl_Data_Entry_Attendance;
                    `)

            const getResult = (await getRequest).recordsets;

            if (getResult[0].length > 0) {

                const workTypeParsed = getResult[0]?.map(o => ({
                    ...o,
                    Categories: JSON.parse(o?.Categories)
                }))

                const StaffTypesParsed = workTypeParsed?.map(o => ({
                    ...o,
                    Categories: o?.Categories?.map(oo => ({
                        ...oo,
                        StaffTypes: JSON.parse(oo?.StaffTypes)
                    }))
                }))

                const StaffAttendanceParsed = StaffTypesParsed?.map(o => ({
                    ...o,
                    Categories: o?.Categories?.map(oo => ({
                        ...oo,
                        StaffTypes: oo?.StaffTypes?.map(ooo => ({
                            ...ooo,
                            StaffAttendance: JSON.parse(ooo?.StaffAttendance)
                        }))
                    }))
                }))

                dataFound(res, StaffAttendanceParsed, null, {
                    WorkDetails: getResult[1],
                    StaffType: getResult[2]
                });

            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const getAttendanceNew = async (req, res) => {
        const { Fromdate, Todate, reqLocation } = req.query;

        if (!reqLocation) {
            return invalidInput(res, 'reqLocation is required');
        }

        try {
            const getRequest = new sql.Request()
                .input('Fromdate', sql.Date, Fromdate ? ISOString(Fromdate) : ISOString())
                .input('Todate', sql.Date, Todate ? ISOString(Todate) : ISOString())
                .input('LocationDetails', sql.NVarChar(50), reqLocation)
                .query(`
                    SELECT 
                        *
                    FROM
                        tbl_Data_Entry_Attendance
                    WHERE
                        EntryDate >= @Fromdate
                        AND
                        EntryDate <= @Todate
                        AND
                        LocationDetails = @LocationDetails
                    ORDER BY
                        EntryDate DESC;

                    SELECT
                        DISTINCT WorkDetails
                    FROM
                        tbl_Data_Entry_Attendance

                    SELECT
                        DISTINCT StaffType
                    FROM
                        tbl_Data_Entry_Attendance;

                    SELECT 
                    	DISTINCT w.WorkDetails, 
                        ( 
                            SELECT 
                                DISTINCT StaffType 
                            FROM 
                                tbl_Data_Entry_Attendance
                            WHERE
                                WorkDetails = w.WorkDetails
                                AND
                                LocationDetails = @LocationDetails
                            FOR JSON PATH
                        ) AS StaffTypes
                    FROM 
                    	tbl_Data_Entry_Attendance AS w
                    WHERE
                        w.LocationDetails = @LocationDetails;
                    `)

            const getResult = (await getRequest).recordsets;



            if (getResult[0].length > 0) {
                const UniqueDate = new Set(getResult[0].map(o => ISOString(o?.EntryDate)));
                const parsedWorkType = getResult[3].map(o => ({
                    WorkDetails: o.WorkDetails,
                    StaffTypes: JSON.parse(o?.StaffTypes)
                }))

                const dataToSend = [...Array.from(UniqueDate)].map(o => ({
                    EntryDate: o,
                    Categories: parsedWorkType.map(category => ({
                        WorkDetails: category.WorkDetails,
                        StaffTypes: [
                            ...category.StaffTypes.map(types => ({
                                StaffType: types.StaffType,
                                StaffAttendance: {
                                    ...getResult[0].find(re =>
                                        (ISOString(re.EntryDate) === ISOString(o))
                                        && (category?.WorkDetails === re.WorkDetails)
                                        && (re.StaffType === types.StaffType)
                                    )
                                }
                            }))
                        ]
                    }))
                }));

                dataFound(res, dataToSend, null, {
                    WorkDetails: getResult[1],
                    StaffType: getResult[2]
                });

            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const insertAttendance = async (req, res) => {

        const { EntryDate, LocationDetails, WorkDetails, StaffType, StaffCount, EntryBy } = req.body;

        if (!LocationDetails || !WorkDetails || !StaffType || !StaffCount || !checkIsNumber(EntryBy)) {
            return invalidInput(res, 'LocationDetails, WorkDetails, StaffType, StaffCount, EntryBy is required');
        }

        try {
            const checkExists = new sql.Request()
                .input('EntryDate', EntryDate ? ISOString(EntryDate) : ISOString())
                .input('LocationDetails', LocationDetails)
                .input('WorkDetails', WorkDetails)
                .input('StaffType', StaffType)
                .query(`
                    SELECT 
                        COUNT (*) AS ROWS 
                    FROM 
                        tbl_Data_Entry_Attendance 
                    WHERE 
                        EntryDate = @EntryDate
                        AND
                        LocationDetails = @LocationDetails
                        AND
                        WorkDetails = @WorkDetails
                        AND
                        StaffType = @StaffType
                    `)

            const checkResult = (await checkExists).recordset[0].ROWS;

            if (checkResult > 0) {
                return failed(res, 'Already Exist')
            }

            const request = new sql.Request()
                .input('EntryDate', EntryDate ? ISOString(EntryDate) : ISOString())
                .input('LocationDetails', LocationDetails)
                .input('WorkDetails', WorkDetails)
                .input('StaffType', StaffType)
                .input('StaffCount', StaffCount)
                .input('EntryBy', EntryBy)
                .query(`
                    INSERT INTO tbl_Data_Entry_Attendance
                        (EntryDate, LocationDetails, WorkDetails, StaffType, StaffCount, EntryBy)
                    VALUES
                        (@EntryDate, @LocationDetails, @WorkDetails, @StaffType, @StaffCount, @EntryBy)
                    `)

            const result = await request;

            if (result.rowsAffected[0] > 0) {
                success(res, 'Attendance Saved');
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const updateAttendance = async (req, res) => {
        const { Id, EntryDate, LocationDetails, WorkDetails, StaffType, StaffCount } = req.body;

        if (!checkIsNumber(Id) || !EntryDate || !LocationDetails || !WorkDetails || !StaffType || !checkIsNumber(StaffCount)) {
            invalidInput(res, 'Id, EntryDate, LocationDetails, WorkDetails, StaffType, StaffCount is required');
        }

        try {
            const checkExists = new sql.Request()
                .input('EntryDate', EntryDate ? ISOString(EntryDate) : ISOString())
                .input('LocationDetails', LocationDetails)
                .input('WorkDetails', WorkDetails)
                .input('StaffType', StaffType)
                .input('Id', Id)
                .query(`
                    SELECT 
                        COUNT (*) AS ROWS 
                    FROM 
                        tbl_Data_Entry_Attendance 
                    WHERE 
                        EntryDate = @EntryDate
                        AND
                        LocationDetails = @LocationDetails
                        AND
                        WorkDetails = @WorkDetails
                        AND
                        StaffType = @StaffType
                        AND
                        Id <> @Id
                    `)

            const checkResult = (await checkExists).recordset[0].ROWS;

            if (checkResult > 0) {
                return failed(res, 'Already Exist')
            }

            const request = new sql.Request()
                .input('Id', Id)
                .input('EntryDate', ISOString(EntryDate))
                .input('LocationDetails', LocationDetails)
                .input('WorkDetails', WorkDetails)
                .input('StaffType', StaffType)
                .input('StaffCount', StaffCount)
                .query(`
                    UPDATE
                        tbl_Data_Entry_Attendance
                    SET
                        EntryDate = @EntryDate,
                        LocationDetails = @LocationDetails,
                        WorkDetails = @WorkDetails,
                        StaffType = @StaffType,
                        StaffCount = @StaffCount
                    WHERE
                        Id = @Id
                    `)

            const result = await request;

            if (result.rowsAffected[0] > 0) {
                success(res, 'Changes Saved')
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    return {
        getAttendance,
        getAttendanceNew,
        insertAttendance,
        updateAttendance,
    }
}

export default dataEntryAttendance();