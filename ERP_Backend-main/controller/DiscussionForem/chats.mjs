import sql from 'mssql';
import { dataFound, noData, servError, invalidInput, success, failed } from '../../res.mjs';
import fs from 'fs';
import mime from 'mime';
import uploadFileMiddleware from '../../middleware/uploadMiddleware.mjs';


const ChatController = () => {

    const getTopicMessages = async (req, res) => {
        const { Topic_Id } = req.query;

        if (!Topic_Id) {
            return invalidInput(res, 'Topic_Id is required');
        }

        try {
            const getQuery = `
            SELECT 
              dm.*,
              u.Name
            FROM tbl_Discussion_Messages  AS dm
              LEFT JOIN tbl_Users AS u
              ON dm.User_Id = u.UserId
            WHERE Topic_Id = '${Topic_Id}'`

            const request = new sql.Request();
            const result = await request.query(getQuery);

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const postMessages = async (req, res) => {
        const { Topic_Id, User_Id, Message } = req.body;

        if (!Number(Topic_Id) || !Number(User_Id) || (!String(Message) && Message.length === 0)) {
            return invalidInput(res, 'Topic_Id, User_Id, Message is required');
        }

        try {
            const query = `
            INSERT INTO 
                tbl_Discussion_Messages 
                    (Topic_Id, User_Id, Message, CreatedAt) 
                VALUES 
                    (@topic, @user, @message, @createdAt)`;
            const request = new sql.Request();
            request.input('topic', sql.Int, Topic_Id);
            request.input('user', sql.Int, User_Id);
            request.input('message', sql.NVarChar(sql.MAX), Message);
            request.input('createdAt', sql.DateTime, new Date());

            const result = await request.query(query);

            if (result.rowsAffected && result.rowsAffected[0] > 0) {
                dataFound(res, [], 'Message Sent');
            } else {
                failed(res, 'Failed to send message');
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const postTeamMembers = async (req, res) => {
        const { Teams, Topic_Id } = req.body;

        if (!Array.isArray(Teams)) {
            return invalidInput(res, 'Teams Array is required');
        }

        if (!Topic_Id) {
            return invalidInput(res, 'Topic_Id is required');
        }

        try {
            const deleteQuery = `DELETE FROM tbl_Discussion_Group_Members WHERE Topic_Id = @topicId`;
            const deleteRequest = new sql.Request();
            deleteRequest.input('topicId', Topic_Id);
            await deleteRequest.query(deleteQuery);

            for (let user of Teams) {
                const insertQuery = `INSERT INTO tbl_Discussion_Group_Members (Topic_Id, User_Id) VALUES (@topicId, @userId)`;
                const insertRequest = new sql.Request();
                insertRequest.input('topicId', Topic_Id);
                insertRequest.input('userId', user.UserId);
                await insertRequest.query(insertQuery);
            }

            return dataFound(res, [], 'Changes Saved');
        } catch (e) {
            servError(e, res);
        }
    };

    const uploadFile = async (req, res) => {

        await uploadFileMiddleware(req, res, 4, 'files');
        const fileName = req?.file?.filename;
        const filePath = req?.file?.path;
        const filetype = req?.file?.mimetype;
        const filesize = req?.file?.size;

        const { Topic_Id, Project_Id, User_Id } = req.body;

        if (!Project_Id || !User_Id) {
            return invalidInput(res, 'Topic_Id, User_Id is required, Project_Id is optional');
        }

        if (!fileName || !filePath) {
            return invalidInput(res, 'Failed to upload File');
        }

        if (fileName.length > 255 || filePath.length > 255) {
            return invalidInput(res, 'File name or path too long');
        }

        try {
            const transaction = await new sql.Transaction().begin();

            try {
                await new sql.Request(transaction)
                    .input('topic', Topic_Id)
                    .input('user', User_Id)
                    .input('message', 'SHARED A DOCUMENT')
                    .input('createdAt', new Date())
                    .query(`
                    INSERT INTO tbl_Discussion_Messages 
                        (Topic_Id, User_Id, Message, CreatedAt) 
                    VALUES 
                        (@topic, @user, @message, @createdAt); `);

                await new sql.Request(transaction)
                    .input('topicId', Topic_Id)
                    .input('projectId', Project_Id || 0)
                    .input('userId', User_Id)
                    .input('filename', fileName)
                    .input('filepath', filePath)
                    .input('filetype', filetype || 'Unknown File Type')
                    .input('filesize', filesize || 0)
                    .input('date', new Date())
                    .query(`
                    INSERT INTO tbl_Discussion_Files 
                        (Topic_Id, Project_Id, User_Id, File_Name, FIle_Path, File_Type, File_Size, CreatedAt) 
                    VALUES 
                        (@topicId, @projectId, @userId, @filename, @filepath, @filetype, @filesize, @date)`);
                    
                    await transaction.commit();
                    success(res, 'File Uploaded Successfully');
                    
            } catch (e) {
                console.error(e);
                await transaction.rollback();
                failed(res, 'File Upload Failed');
            }
        } catch (er) {
            servError(er, res);
        }
    };

    const documentsListForTopic = async (req, res) => {
        const { Topic_Id } = req.query;

        if (!Number(Topic_Id)) {
            return invalidInput(res, 'Topic_Id is required');
        }

        try {

            const request = new sql.Request()
                .input('Topic_Id', Topic_Id)
                .query(`
                    SELECT 
                    	df.Id AS FileId, 
                    	df.File_Name AS FileName,
                        df.File_Type AS FileType,
                        df.File_Size AS FileSize,
                        u.Name AS SharedBY,
                        df.User_Id AS SenderId,
                        df.CreatedAt AS SendDate
                    FROM 
                    	tbl_Discussion_Files AS df
                    	LEFT JOIN 
                    		tbl_Users AS u ON df.User_Id = u.UserId
                    WHERE 
                    	df.Topic_Id = @Topic_Id
                    ORDER BY 
                        df.CreatedAt DESC`);

            const result = await request;

            if (result.recordset.length > 0) {
                return dataFound(res, result.recordset)
            } else {
                return noData(res)
            }

        } catch (e) {
            servError(e, res);
        }
    }

    const downloadDocument = async (req, res) => {
        const { FileId } = req.query;

        if (!Number(FileId)) {
            return invalidInput(res, 'FileId is required');
        }

        try {
            const result = await new sql.Request()
                .input('fileid', FileId)
                .query(`
                    SELECT 
                        File_Name, FIle_Path 
                    FROM 
                        tbl_Discussion_Files 
                    WHERE 
                        Id = @fileid`);

            if (result.recordset.length > 0) {
                const { File_Name, FIle_Path } = result.recordset[0];

                if (fs.existsSync(FIle_Path)) {
                    res.setHeader('Content-Disposition', `attachment; filename="${File_Name}"`);
                    const mimeType = mime.getType(FIle_Path) || 'application/octet-stream';
                    res.setHeader('Content-Type', mimeType);

                    const readStream = fs.createReadStream(FIle_Path);
                    readStream.pipe(res);
                } else {
                    return noData(res, 'File not found');
                }
            } else {
                return noData(res, 'File not found');
            }
        } catch (e) {
            servError(e, res);
        }
    };


    return {
        postTeamMembers,
        getTopicMessages,
        postMessages,
        uploadFile,
        documentsListForTopic,
        downloadDocument
    }
}

export default ChatController()