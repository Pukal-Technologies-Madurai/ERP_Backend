import express from 'express';
import projectMaster from '../controller/ProjectsAndTasks/projectMaster.mjs';
import tasksMaster from '../controller/ProjectsAndTasks/tasksMaster.mjs';
import parameters from '../controller/ProjectsAndTasks/parameters.mjs';
import projectSchedule from '../controller/ProjectsAndTasks/projectSchedule.mjs';
import taskActivity from '../controller/ProjectsAndTasks/taskActivity.mjs';
import employeesAndTasks from '../controller/ProjectsAndTasks/employeesAndTasks.mjs';
import taskWorks from '../controller/ProjectsAndTasks/taskWorks.mjs';

const projectRoute = express.Router();



projectRoute.get('/project/dropDown', projectMaster.getProjectDropDown);
projectRoute.get('/project', projectMaster.getProject);
projectRoute.get('/project/Abstract', projectMaster.getProjectAbstract);
projectRoute.post('/project', projectMaster.postProject);
projectRoute.put('/project', projectMaster.editProject);
projectRoute.delete('/project', projectMaster.deleteProject);
projectRoute.get('/statusList', projectMaster.getStatusList);
projectRoute.get('/project/newAbstract', projectMaster.getProjectAbstractProjectId);
projectRoute.get('/project/newProjectAbstract', projectMaster.newProjectAbstract);

projectRoute.get('/project/AbstractNew', projectMaster.projectAbstractTaskNew);


projectRoute.get('/project/schedule/newscheduleType', projectSchedule.newgetScheduleType);
projectRoute.get('/project/schedule/scheduleType', projectSchedule.getScheduleType);
projectRoute.get('/project/schedule', projectSchedule.getSchedule);
projectRoute.post('/project/schedule', projectSchedule.createSchedule);
projectRoute.put('/project/schedule', projectSchedule.putSchedule);
projectRoute.delete('/project/schedule', projectSchedule.deleteSchedule);

projectRoute.post('/project/schedule/scheduleTask', projectSchedule.assignTaskInSchedule);
projectRoute.put('/project/schedule/scheduleTask', projectSchedule.modifyTaskInSchedule);
projectRoute.delete('/project/schedule/scheduleTask', projectSchedule.deleteTaskInSchedule);
projectRoute.get('/project/schedule/projectDetailsforReport', projectSchedule.projectDetailsforReport   );


projectRoute.get('/project/schedule/projectScheduleTaskdetails',projectSchedule.projectScheduleTaskdetails)
projectRoute.put('/project/schedule/updateScheduleTaskUpdate',projectSchedule.projectScheduleTaskupdate)




projectRoute.post('/project/schedule/createNewTaskwithSchedule', projectSchedule.createNewTaskwithSchedule);
projectRoute.get('/project/schedule/ListingDetails', projectSchedule.getScheduleProjectid);



projectRoute.get('/parameters', parameters.getTaskParameters);
projectRoute.post('/parameters', parameters.addTaskPrarameter);
projectRoute.put('/parameters', parameters.editTaskPrarameter);
projectRoute.delete('/parameters', parameters.delTaskParameter);


projectRoute.get('/tasks/tasklists', tasksMaster.getTasksbyid);
projectRoute.get('/tasks/tasklistsid', tasksMaster.getTaskIndividualId);

projectRoute.get('/tasks', tasksMaster.getTasks);
projectRoute.get('/tasks/dropdown', tasksMaster.getTaskDropDown);
projectRoute.post('/tasks', tasksMaster.createTask);
projectRoute.put('/tasks', tasksMaster.editTask);
projectRoute.delete('/tasks', tasksMaster.deleteTask);

projectRoute.get('/tasks/todayTasks', employeesAndTasks.todayTasks);
projectRoute.get('/tasks/myTasks', employeesAndTasks.getMyTasks);

projectRoute.get('/task/startTask', employeesAndTasks.getTaskStartTime);
projectRoute.post('/task/startTask', employeesAndTasks.postStartTime);
projectRoute.delete('/task/startTask', employeesAndTasks.deleteTaskTime);

projectRoute.get('/tasks/assignedTask',employeesAndTasks.EmptaskDetails)

projectRoute.get('/task/workedDetails', taskActivity.getWorkedDetailsForTask);
projectRoute.get('/task/workedUsers/dropDown',taskActivity.getFilteredUsersBasedOnTasks)

projectRoute.get('/task/assignEmployee', taskActivity.getEmployeeAssignedInTheTask);
projectRoute.get('/task/assignEmployee/user/dropDown', taskActivity.getTaskAssignedUsers);
projectRoute.get('/task/assignEmployee/task/dropDown', taskActivity.getAssignedTasks);
projectRoute.post('/task/assignEmployee', taskActivity.assignTaskForEmployee);
projectRoute.put('/task/assignEmployee', taskActivity.modifyTaskAssignedForEmployee);

projectRoute.get('/task/workDetails',taskWorks.getAllNewFormatData)
projectRoute.get('/task/work', taskWorks.getAllWorkedData);
projectRoute.post('/task/work', taskWorks.postWorkedTask);

projectRoute.get('/task/work/groupd', taskWorks.getAllGroupedWorkedData);
projectRoute.get('/task/work/pieChart', taskWorks.taskWorkDetailsPieChart);
projectRoute.get('/task/work/barChart', taskWorks.taskWorkDetailsBarChart);


// projectRoute.get('/task/work/employeeWorks', taskWorks.getAllWorkedDataOfEmp);  same code repeted
// projectRoute.get('/task/work/employeeWorks', taskWorks.getEmployeeWorkedTask);   '''
// router.get('/workReport', workController.getAllWorkedData); '''
// router.get('/task/employeeInvolved', workController.EmployeeTaskDropDown);
projectRoute.get('/processMaster/dropDown',taskWorks.getProcessDetails)


projectRoute.get('/tasks/project/dropdown',taskActivity.getProjectDropDown)

projectRoute.get('/project/schedule/ListingDetailsAbstract',projectSchedule.getScheduleProjectidActivity)

projectRoute.get('/workDetailsTask',taskActivity.getWorkDetailsWithTask)

export default projectRoute;