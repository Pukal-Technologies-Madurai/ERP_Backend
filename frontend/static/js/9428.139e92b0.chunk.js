"use strict";(self.webpackChunkerp=self.webpackChunkerp||[]).push([[9428],{62344:(e,a,l)=>{l.d(a,{o$:()=>o,o5:()=>r,cF:()=>d,iI:()=>t});const s=l.p+"static/media/smt.aa4d4f940bbebff07a57.png",t={table:{style:{width:"auto",backgroundColor:"transparent"}},rows:{style:{backgroundColor:"transparent"}},headCells:{style:{backgroundColor:"#6b9080f8",color:"white",fontSize:"14px"}}},d={control:(e,a)=>({...e,height:"45px",background:"rgba(255, 255, 255, 0.322)"}),menu:(e,a)=>({...e,zIndex:9999})},o=[{id:1,headname:"Menu ID",variant:"head",align:"left",width:100},{id:2,headname:"MenuName"},{id:3,headname:"Read Rights"},{id:4,headname:"Add Rights"},{id:5,headname:"Edit Rights"},{id:6,headname:"Delete Rights"},{id:7,headname:"Print Rights"},{id:8,headname:"Action"}],r=[{dataBase:1,name:"SHANKAR TRADERS",business:"Wholesale Merchant in Dhall",address:"32, Chitrakara Street, Madurai - 01 <br /> Bill of Supply -Disclaimer Affidavlt Field Extemped",logo:s,gstin:"33AADFS6973R1ZD",phone:"984-313-1353, 984-335-5166",fssai:"12418012000818",bankAccount:"0021 5032 0885 122",ifsc:"TMBL0000002"},{dataBase:2,name:"SMT AGRO PRODUCTS",business:"",address:"H.O: 153, Chitrakara Street, 2nd Floor, Madurai -01 <br /> G.O: 746 Puliyur, Sayanapuram, Svga <br /> Bill of Supply -Disclaimer Affidavlt Field Extemped",logo:s,gstin:"33ACMFS3420Q1ZQ",phone:"0452-4371625",fssai:"12418012000818",bankAccount:"0025 3031 0875 947",ifsc:"TMBL0000002"},{dataBase:3,name:"BHAVANI TRADERS",business:"",address:"H.O: 152-A, Chitrakara Street, Madurai -01 <br /> G.O: 30/1-Rajman Nagar, Chintamani Main Road, Mdu-01 <br /> Tax Invoice",logo:s,gstin:"33AAEFB6728J1ZG",phone:"958-559-7641, 958-559-7614",fssai:"12418012000670",bankAccount:"0021 5005 0800 309",ifsc:"TMBL0000002"}]},60012:(e,a,l)=>{l.r(a),l.d(a,{default:()=>j});var s=l(69060),t=l(82656),d=l(26773),o=l(4488),r=l(90048),i=l(89e3),n=(l(21680),l(11782)),c=l(6444),m=l(60336),u=l(99016),h=l(11040),v=l(30612),p=l(62344),b=l(1908),x=l(82496);const j=()=>{var e,a;const l=localStorage.getItem("user"),j=JSON.parse(l),N={Emp_Id:"",Project_Id:0,Task_Id:0,from:(new Date).toISOString().split("T")[0],to:(new Date).toISOString().split("T")[0],EmpGet:"All Employee",ProjectGet:"All Project",TaskGet:"All Task"},[f,k]=(0,s.useState)([]),[S,T]=(0,s.useState)({}),[g,_]=(0,s.useState)(!1),[D,I]=(0,s.useState)(N),[y,A]=(0,s.useState)([]),[C,E]=(0,s.useState)([]),[M,P]=(0,s.useState)([]);(0,s.useEffect)((()=>{(0,b.q)({address:"taskManagement/task/work?Emp_Id=".concat(D.Emp_Id,"&Project_Id=").concat(D.Project_Id,"&from=").concat(D.from,"&to=").concat(D.to,"&Task_Id=").concat(D.Task_Id)}).then((e=>{e.success&&k(e.data)})).catch((e=>console.error(e)))}),[D]),(0,s.useEffect)((()=>{(0,b.q)({address:"taskManagement/project/dropDown?Company_id=".concat(null===j||void 0===j?void 0:j.Company_id)}).then((e=>{e.success&&A(e.data)})).catch((e=>console.error(e))),(0,b.q)({address:"masters/users/employee/dropDown?BranchId=".concat(null===j||void 0===j?void 0:j.BranchId,"&Company_id=").concat(null===j||void 0===j?void 0:j.Company_id)}).then((e=>{var a;e.success&&E(null===e||void 0===e||null===(a=e.data)||void 0===a?void 0:a.sort(((e,a)=>String(null===e||void 0===e?void 0:e.Name).localeCompare(null===a||void 0===a?void 0:a.Name))))})).catch((e=>console.error(e))),(0,b.q)({address:"taskManagement/task/assignEmployee/task/dropDown"}).then((e=>{var a;e.success&&P(null===e||void 0===e||null===(a=e.data)||void 0===a?void 0:a.sort(((e,a)=>String(null===e||void 0===e?void 0:e.Task_Name).localeCompare(null===a||void 0===a?void 0:a.Task_Name))))})).catch((e=>console.error(e)))}),[null===j||void 0===j?void 0:j.BranchId]);const w=e=>{const[a,l]=e.split(":").map(Number);let s=a%12;s=s||12;const t=a<12?"AM":"PM",d=l<10?"0"+l:l;return"".concat(s<10?"0"+s:s,":").concat(d," ").concat(t)};return(0,x.jsxs)(x.Fragment,{children:[(0,x.jsxs)("div",{className:"row",children:[(0,x.jsx)("div",{className:"col-xxl-2 col-lg-3 col-md-4 col-sm-4 p-2",children:(0,x.jsx)(v.cp,{value:{value:null===D||void 0===D?void 0:D.Emp_Id,label:null===D||void 0===D?void 0:D.EmpGet},onChange:e=>I({...D,Emp_Id:e.value,EmpGet:e.label}),options:[{value:"",label:"All Employee"},...C.map((e=>({value:e.UserId,label:e.Name})))],styles:p.cF,isSearchable:!0,placeholder:"Employee Name"})}),(0,x.jsx)("div",{className:"col-xxl-2 col-lg-3 col-md-4 col-sm-4 p-2",children:(0,x.jsx)(v.cp,{value:{value:null===D||void 0===D?void 0:D.Project_Id,label:null===D||void 0===D?void 0:D.ProjectGet},onChange:e=>I({...D,Project_Id:e.value,ProjectGet:e.label}),options:[...y.map((e=>({value:e.Project_Id,label:0===Number(e.Project_Id)?"All Project":e.Project_Name})))],styles:p.cF,isSearchable:!0,placeholder:"Project Title"})}),(0,x.jsx)("div",{className:"col-xxl-2 col-lg-3 col-md-4 col-sm-4 p-2",children:(0,x.jsx)(v.cp,{value:{value:null===D||void 0===D?void 0:D.Task_Id,label:null===D||void 0===D?void 0:D.TaskGet},onChange:e=>I({...D,Task_Id:e.value,TaskGet:e.label}),options:[{value:0,label:"All Task"},...M.map((e=>({value:e.Task_Id,label:e.Task_Name})))],styles:p.cF,isSearchable:!0,placeholder:"Select Task"})})]}),(0,x.jsxs)("div",{className:"px-3 py-2 calendar",children:[(0,x.jsx)("h4",{className:"mb-3 text-center text-primary",children:"Completed Tasks"}),(0,x.jsx)(n.c,{plugins:[m.c,h.c,c.c,u.cp],initialView:"dayGridMonth",initialDate:new Date,events:f.map((e=>({title:null===e||void 0===e?void 0:e.Task_Name,start:new Date(null===e||void 0===e?void 0:e.Work_Dt).toISOString().split("T")[0]+"T"+(null===e||void 0===e?void 0:e.Start_Time),end:new Date(null===e||void 0===e?void 0:e.Work_Dt).toISOString().split("T")[0]+"T"+(null===e||void 0===e?void 0:e.End_Time),objectData:e}))),headerToolbar:{left:"prev next",center:"title",right:"timeGridDay, timeGridWeek, dayGridMonth, listMonth"},slotDuration:"00:20:00",slotMinTime:"08:00:00",slotMaxTime:"22:00:00",showNonCurrentDates:!1,editable:!1,selectMirror:!0,eventClick:e=>{const a=e.event.extendedProps.objectData;T(a),_(!0)},datesSet:e=>{I((a=>({...a,from:e.startStr.split("T")[0],to:e.endStr.split("T")[0]})))},height:1200})]}),(0,x.jsxs)(t.c,{open:g,maxWidth:"sm",fullWidth:!0,onClose:()=>{_(!1),T({})},children:[(0,x.jsx)(d.c,{className:"fa-18",children:"Work Details"}),(0,x.jsx)(o.c,{className:"pb-0",children:(0,x.jsx)("div",{className:"table-responsive pb-0",children:(0,x.jsx)("table",{className:"table mb-0",children:(0,x.jsxs)("tbody",{children:[(0,x.jsxs)("tr",{children:[(0,x.jsx)("td",{className:"border-1 fa-14",children:"EmpName"}),(0,x.jsx)("td",{className:"border-1 fa-14",children:null===S||void 0===S?void 0:S.EmployeeName})]}),(0,x.jsxs)("tr",{children:[(0,x.jsx)("td",{className:"border-1 fa-14",children:"Task"}),(0,x.jsx)("td",{className:"border-1 fa-14",children:null===S||void 0===S?void 0:S.Task_Name})]}),(0,x.jsxs)("tr",{children:[(0,x.jsx)("td",{className:"border-1 fa-14",children:"Date"}),(0,x.jsx)("td",{className:"border-1 fa-14",children:(null===S||void 0===S?void 0:S.Work_Dt)&&new Date(null===S||void 0===S?void 0:S.Work_Dt).toLocaleDateString("en-IN",{day:"2-digit",month:"2-digit",year:"numeric"})})]}),(0,x.jsxs)("tr",{children:[(0,x.jsx)("td",{className:"border-1 fa-14",children:"Start Time"}),(0,x.jsx)("td",{className:"border-1 fa-14",children:(null===S||void 0===S?void 0:S.Start_Time)&&w(null===S||void 0===S?void 0:S.Start_Time)})]}),(0,x.jsxs)("tr",{children:[(0,x.jsx)("td",{className:"border-1 fa-14",children:"End Time"}),(0,x.jsx)("td",{className:"border-1 fa-14",children:(null===S||void 0===S?void 0:S.End_Time)&&w(null===S||void 0===S?void 0:S.End_Time)})]}),(0,x.jsxs)("tr",{children:[(0,x.jsx)("td",{className:"border-1 fa-14",children:"Duration"}),(0,x.jsxs)("td",{className:"border-1 fa-14",children:[null===S||void 0===S?void 0:S.Tot_Minutes," ( Minutes )"]})]}),(0,x.jsxs)("tr",{children:[(0,x.jsx)("td",{className:"border-1 fa-14",children:"Description"}),(0,x.jsx)("td",{className:"border-1 fa-14",children:null===S||void 0===S?void 0:S.Work_Done})]}),(0,x.jsxs)("tr",{children:[(0,x.jsx)("td",{className:"border-1 fa-14",children:"Status"}),(0,x.jsx)("td",{className:"border-1 fa-14",children:null===S||void 0===S?void 0:S.WorkStatus})]}),(0,x.jsxs)("tr",{children:[(0,x.jsx)("td",{className:"border-1 fa-14",children:"Project"}),(0,x.jsx)("td",{className:"border-1 fa-14",children:null===S||void 0===S?void 0:S.Project_Name})]}),(null===S||void 0===S||null===(e=S.Work_Param)||void 0===e?void 0:e.length)>0&&(0,x.jsx)("tr",{children:(0,x.jsx)("td",{colSpan:2,className:"border-1 fa-14 text-center text-uppercase",children:"Parameter Values"})}),null===S||void 0===S||null===(a=S.Work_Param)||void 0===a?void 0:a.map(((e,a)=>(0,x.jsxs)("tr",{children:[(0,x.jsx)("td",{className:"border-1 fa-14",children:null===e||void 0===e?void 0:e.Paramet_Name}),(0,x.jsx)("td",{className:"border-1 fa-14",children:null===e||void 0===e?void 0:e.Current_Value})]},a)))]})})})}),(0,x.jsx)(r.c,{children:(0,x.jsx)(i.c,{onClick:()=>{_(!1),T({})},children:"close"})})]})]})}}}]);
//# sourceMappingURL=9428.139e92b0.chunk.js.map