import sql from 'mssql'
import { servError, dataFound, noData, failed, success, invalidInput } from '../../res.mjs';


const taskTypeControlelr = () => {

    const TaskTypeDropDown = async (req, res) => {
        try {
            const query = `SELECT Task_Type_Id, Task_Type FROM tbl_Task_Type ORDER BY Task_Type`;

            const request = new sql.Request();
            const result = await request.query(query);

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const getTaskTyepe = async (req, res) => {

        try {
            const result = (await new sql.Request().query(`select tt.*,p.Project_Name from tbl_Task_Type tt
left join tbl_Project_Master p ON p.Project_Id=tt.Project_Id 
where tt.TT_Del_Flag !=1
order by Task_Type_Id desc`)).recordset
            if (result.length > 0) {
                dataFound(res, result);
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res)
        }
    }


// const postTaskType = async (req, res) => {
//     const data = req.body.Task_Type || req.body;

//     if (!req.body) {
//         return invalidInput(res, 'Task_Type object is missing');
//     }

//     const {
//         Task_Type,
//         Task_Type_Id,
//         ProjectId,
//         Est_StartDate,
//         Est_EndDate,
//         Status
//     } = data;

  

//     // if (!ProjectId) {
//     //     return invalidInput(res, 'Project_Id is required');
//     // }

//     try {
//         const result = await new sql.Request()
//             .input('Mode', req.body.Mode || 1)
//             .input('Task_Type_Id', Task_Type_Id || 0)
//             .input('Task_Type', Task_Type || req.body.Task_Type)
//             .input('Project_Id', ProjectId || req.body.Project_Id)
//             .input('Est_StartTime', Est_StartDate ? new Date(Est_StartDate) : new Date())
//             .input('Est_EndTime', Est_EndDate ? new Date(Est_EndDate) : new Date())
//             .input('Status', Status || 1)
//             .execute('Task_Type_SP');

//         if (result.rowsAffected[0] > 0) {
//             success(res, 'Task type added successfully', { Task_Type_Id: result.recordset[0] });
//         } else {
//             failed(res, 'Failed to add task type');
//         }
//     } catch (e) {
//         servError(e, res);
//     }
// };


const postTaskType = async (req, res) => {
    const data = req.body.Task_Type || req.body;

    if (!req.body) {
        return invalidInput(res, 'Task_Type object is missing');
    }

    const {
        Task_Type,
        Task_Type_Id,
        Project_Id,
        Day_Duration,
        Est_StartDate,
        Est_EndDate,
        Status
    } = data;

    // if (!Project_Id) {
    //     return invalidInput(res, 'Project_Id is required');
    // }

    try {
        const result = await new sql.Request()
            .input('Mode', req.body.Mode || 1)
            .input('Task_Type_Id', Task_Type_Id || 0)
            .input('Task_Type', Task_Type || req.body.Task_Type)
            .input('Day_Duration',Day_Duration || req.body.Day_Duration)
            .input('Project_Id', Project_Id || req.body.Project_Id)
            .input('Est_StartTime', Est_StartDate ? new Date(Est_StartDate) : new Date())
            .input('Est_EndTime', Est_EndDate ? new Date(Est_EndDate) : new Date())
            .input('Status', Status || 1)
            .execute('Task_Type_SP');

        if (result.rowsAffected[0] > 0) {
            success(res, 'Task type added successfully', { Task_Type_Id: result.recordset[0] });
        } else {
            failed(res, 'Failed to add task type');
        }
    } catch (e) {
        servError(e, res);
    }
};



    const editTaskType = async (req, res) => {
     
      const { Mode, Task_Type_Id, Task_Type, Project_Id, Day_Duration,Est_StartTime, Est_EndTime, Status } = req.body;

    if (!Task_Type_Id) {
        return invalidInput(res, 'Task_Type_Id is required')
    }
    
    if (!Task_Type) {
        return invalidInput(res, 'Task_Type is required')
    }
    
    if (!Project_Id ) {
        return invalidInput(res, 'ProjectId is required')
    }

    try {
        const result = await new sql.Request()
            .input('Mode', Mode || 2)
            .input('Task_Type_Id', Task_Type_Id)
            .input('Task_Type', Task_Type)
            .input('Project_Id', Project_Id)
             .input('Day_Duration', Day_Duration)  
            .input('Est_StartTime', Est_StartTime ? new Date(Est_StartTime) : new Date())
            .input('Est_EndTime', Est_EndTime ? new Date(Est_EndTime) : new Date())
            .input('Status', Status || 1)
            .execute('Task_Type_SP')

        if (result.rowsAffected[0] > 0) {
            success(res, 'Task type updated successfully')
        } else {
            failed(res, 'Failed to update task type');
        }
    } catch (e) {
        servError(e, res)
    }
};


    const deleteTaskType = async (req, res) => {
        const { Task_Type_Id } = req.body;

        if (!Task_Type_Id) {
            return invalidInput(res, 'Task_Type_Id is required');
        }

        try {
            const request = new sql.Request();
            request.input('Mode', 3);
            request.input('Task_Type_Id', Task_Type_Id);
            request.input('Task_Type', 0);

            // const result = await request.execute('Task_Type_SP');
            const result=await request.query(`UPDATE tbl_Task_Type SET TT_Del_Flag=1 where Task_Type_Id= @Task_Type_Id`)

            if (result.rowsAffected[0] > 0) {
                success(res, 'Task type deleted successfully')
            } else {
                failed(res, 'Failed to delete task type')
            }
        } catch (e) {
            servError(e, res)
        }
    };


    return {
        TaskTypeDropDown,
        getTaskTyepe,
        postTaskType,
        editTaskType,
        deleteTaskType
    }
}

export default taskTypeControlelr()