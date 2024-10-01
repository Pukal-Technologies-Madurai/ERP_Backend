"use strict";(self.webpackChunkerp=self.webpackChunkerp||[]).push([[2600],{32600:(e,s,a)=>{a.r(s),a.d(s,{default:()=>b});var t=a(69060),c=a(56480),r=a(42136),l=a(5548),n=a(82656),o=a(26773),d=a(4488),i=a(90048),h=a(89e3),p=a(75848),u=a(51752),x=a(86e3),y=a(45180),m=a(1908),j=a(82496);const T={Task_Type:"",Task_Type_Id:""};const b=function(){const[e,s]=(0,t.useState)([]),[a,b]=(0,t.useState)(),[f,v]=(0,t.useState)(T),[k,g]=(0,t.useState)(!1),[N,C]=(0,t.useState)({}),[_,w]=(0,t.useState)(""),[D,I]=(0,t.useState)(!1),[S,z]=(0,t.useState)(!1);(0,t.useEffect)((()=>{(0,m.q)({address:"masters/taskType"}).then((e=>{e.success&&s(e.data)})).catch((e=>console.error(e)))}),[a]);const M=()=>{g(!1)};return(0,j.jsxs)(t.Fragment,{children:[(0,j.jsxs)("div",{className:"card",children:[(0,j.jsxs)("div",{className:"card-header bg-white fw-bold d-flex align-items-center justify-content-between",children:["Task Types",(0,j.jsx)("div",{className:"text-end",children:(0,j.jsx)(r.c,{className:"rounded-5 px-3 py-1 fa-13 shadow",onClick:()=>I(!0),children:"Create Task Type"})})]}),(0,j.jsx)("div",{className:"card-body overflow-scroll",style:{maxHeight:"78vh"},children:(0,j.jsx)("div",{className:"table-responsive",children:(0,j.jsxs)(u.c,{className:"",children:[(0,j.jsx)("thead",{children:(0,j.jsxs)("tr",{children:[(0,j.jsx)("th",{className:"fa-14",children:"Id No"}),(0,j.jsx)("th",{className:"fa-14",children:"Task Type"}),(0,j.jsx)("th",{className:"fa-14",children:"Action"})]})}),(0,j.jsx)("tbody",{children:e.map(((e,s)=>(0,j.jsxs)("tr",{children:[(0,j.jsx)("td",{className:"fa-14",children:e.Task_Type_Id}),(0,j.jsx)("td",{className:"fa-14",children:e.Task_Type}),(0,j.jsxs)("td",{className:"fa-12",style:{minWidth:"80px"},children:[(0,j.jsx)(l.c,{onClick:()=>{var s;s=e,z(!0),v({Task_Type:s.Task_Type,Task_Type_Id:s.Task_Type_Id})},size:"small",children:(0,j.jsx)(x.c,{className:"fa-in"})}),(0,j.jsx)(l.c,{onClick:()=>{C(e),g(!0)},size:"small",children:(0,j.jsx)(y.c,{className:"fa-in del-red"})})]})]},s)))})]})})})]}),(0,j.jsxs)(n.c,{open:S,onClose:()=>z(!1),"aria-labelledby":"alert-dialog-title","aria-describedby":"alert-dialog-description",children:[(0,j.jsx)(o.c,{id:"alert-dialog-title",children:"Task Type"}),(0,j.jsx)(d.c,{children:(0,j.jsxs)("div",{className:"p-2",children:[(0,j.jsx)("label",{children:"Task Type"}),(0,j.jsx)("input",{type:"text",onChange:e=>v({...f,Task_Type:e.target.value}),value:f.Task_Type,className:"cus-inpt"})]})}),(0,j.jsxs)(i.c,{children:[(0,j.jsx)(h.c,{onClick:()=>z(!1),children:"Cancel"}),(0,j.jsx)(h.c,{onClick:()=>{return e=f.Task_Type,s=f.Task_Type_Id,void(0,m.q)({address:"masters/taskType",method:"PUT",headers:{"Content-Type":"application/json"},bodyData:{Task_Type:e,Task_Type_Id:s}}).then((e=>{e.success?(c.m4.success(e.message),b(!a),z(!1)):(z(!1),c.m4.error(e.message))})).catch((e=>console.error(e))).finally((()=>v(T)));var e,s},autoFocus:!0,color:"success",children:"Update"})]})]}),(0,j.jsxs)(n.c,{open:D,onClose:()=>I(!1),"aria-labelledby":"alert-dialog-title","aria-describedby":"alert-dialog-description",children:[(0,j.jsx)(o.c,{id:"alert-dialog-title",children:"Create new Task"}),(0,j.jsx)(d.c,{children:(0,j.jsxs)("div",{className:"py-2",children:[(0,j.jsx)("label",{children:"UserType Name"}),(0,j.jsx)("input",{type:"text",onChange:e=>w(e.target.value),value:_,className:"cus-inpt"})]})}),(0,j.jsxs)(i.c,{children:[(0,j.jsx)(h.c,{onClick:()=>I(!1),children:"Cancel"}),(0,j.jsx)(h.c,{onClick:()=>{(0,m.q)({address:"masters/taskType",method:"POST",headers:{"Content-Type":"application/json"},bodyData:{Task_Type:_}}).then((e=>{e.success?(I(!1),b(!a),c.m4.success(e.message)):(I(!1),c.m4.error(e.message))})).catch((e=>console.error(e))).finally((()=>w("")))},color:"success",children:"Create"})]})]}),(0,j.jsxs)(n.c,{open:k,onClose:M,"aria-labelledby":"alert-dialog-title","aria-describedby":"alert-dialog-description",children:[(0,j.jsx)(o.c,{id:"alert-dialog-title",children:"Confirmation"}),(0,j.jsx)(d.c,{children:(0,j.jsx)(p.c,{id:"alert-dialog-description",children:(0,j.jsx)("b",{children:"Do you want to delete the Task Type?"})})}),(0,j.jsxs)(i.c,{children:[(0,j.jsx)(h.c,{onClick:()=>M(),children:"Cancel"}),(0,j.jsx)(h.c,{onClick:()=>{(0,m.q)({address:"masters/taskType",method:"DELETE",headers:{"Content-Type":"application/json"},bodyData:{Task_Type_Id:N.Task_Type_Id}}).then((e=>{e.success?(b(!a),g(!1),c.m4.success("Chip deleted successfully!")):(g(!1),c.m4.error("Failed to delete chip:",e.message))})).catch((e=>console.error(e))).finally((()=>C({})))},autoFocus:!0,color:"error",children:"Delete"})]})]})]})}},45180:(e,s,a)=>{a.d(s,{c:()=>r});var t=a(27664),c=a(82496);const r=(0,t.c)((0,c.jsx)("path",{d:"M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"}),"Delete")},86e3:(e,s,a)=>{a.d(s,{c:()=>r});var t=a(27664),c=a(82496);const r=(0,t.c)((0,c.jsx)("path",{d:"M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z"}),"Edit")},75848:(e,s,a)=>{a.d(s,{c:()=>T});var t=a(95656),c=a(45072),r=a(69060),l=a(79736),n=a(21412),o=a(12556),d=a(43424),i=a(49836),h=a(56880),p=a(10099),u=a(33448);function x(e){return(0,u.cp)("MuiDialogContentText",e)}(0,p.c)("MuiDialogContentText",["root"]);var y=a(82496);const m=["children","className"],j=(0,o.cp)(h.c,{shouldForwardProp:e=>(0,d.c)(e)||"classes"===e,name:"MuiDialogContentText",slot:"Root",overridesResolver:(e,s)=>s.root})({}),T=r.forwardRef((function(e,s){const a=(0,i.C)({props:e,name:"MuiDialogContentText"}),{className:r}=a,o=(0,t.c)(a,m),d=(e=>{const{classes:s}=e,a=(0,n.c)({root:["root"]},x,s);return(0,c.c)({},s,a)})(o);return(0,y.jsx)(j,(0,c.c)({component:"p",variant:"body1",color:"text.secondary",ref:s,ownerState:o,className:(0,l.c)(d.root,r)},a,{classes:d}))}))},16344:(e,s,a)=>{a.d(s,{cV:()=>l,cp:()=>o});var t=a(69060),c=a(82496);const r=["as","disabled"];function l(e){let{tagName:s,disabled:a,href:t,target:c,rel:r,role:l,onClick:n,tabIndex:o=0,type:d}=e;s||(s=null!=t||null!=c||null!=r?"a":"button");const i={tagName:s};if("button"===s)return[{type:d||"button",disabled:a},i];const h=e=>{(a||"a"===s&&function(e){return!e||"#"===e.trim()}(t))&&e.preventDefault(),a?e.stopPropagation():null==n||n(e)};return"a"===s&&(t||(t="#"),a&&(t=void 0)),[{role:null!=l?l:"button",disabled:void 0,tabIndex:a?void 0:o,href:t,target:"a"===s?c:void 0,"aria-disabled":a||void 0,rel:"a"===s?r:void 0,onClick:h,onKeyDown:e=>{" "===e.key&&(e.preventDefault(),h(e))}},i]}const n=t.forwardRef(((e,s)=>{let{as:a,disabled:t}=e,n=function(e,s){if(null==e)return{};var a,t,c={},r=Object.keys(e);for(t=0;t<r.length;t++)a=r[t],s.indexOf(a)>=0||(c[a]=e[a]);return c}(e,r);const[o,{tagName:d}]=l(Object.assign({tagName:a,disabled:t},n));return(0,c.jsx)(d,Object.assign({},n,o,{ref:s}))}));n.displayName="Button";const o=n},42136:(e,s,a)=>{a.d(s,{c:()=>i});var t=a(264),c=a.n(t),r=a(69060),l=a(16344),n=a(83576),o=a(82496);const d=r.forwardRef(((e,s)=>{let{as:a,bsPrefix:t,variant:r="primary",size:d,active:i=!1,disabled:h=!1,className:p,...u}=e;const x=(0,n.Ky)(t,"btn"),[y,{tagName:m}]=(0,l.cV)({tagName:a,disabled:h,...u}),j=m;return(0,o.jsx)(j,{...y,...u,ref:s,disabled:h,className:c()(p,x,i&&"active",r&&"".concat(x,"-").concat(r),d&&"".concat(x,"-").concat(d),u.href&&h&&"disabled")})}));d.displayName="Button";const i=d},51752:(e,s,a)=>{a.d(s,{c:()=>o});var t=a(264),c=a.n(t),r=a(69060),l=a(83576),n=a(82496);const o=r.forwardRef(((e,s)=>{let{bsPrefix:a,className:t,striped:r,bordered:o,borderless:d,hover:i,size:h,variant:p,responsive:u,...x}=e;const y=(0,l.Ky)(a,"table"),m=c()(t,y,p&&"".concat(y,"-").concat(p),h&&"".concat(y,"-").concat(h),r&&"".concat(y,"-").concat("string"===typeof r?"striped-".concat(r):"striped"),o&&"".concat(y,"-bordered"),d&&"".concat(y,"-borderless"),i&&"".concat(y,"-hover")),j=(0,n.jsx)("table",{...x,className:m,ref:s});if(u){let e="".concat(y,"-responsive");return"string"===typeof u&&(e="".concat(e,"-").concat(u)),(0,n.jsx)("div",{className:e,children:j})}return j}))}}]);
//# sourceMappingURL=2600.4702f51c.chunk.js.map