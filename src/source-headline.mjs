// Extract only an explicitly introduced name, never invent a summary.
export function shortSourceHeadline(text){
 const input=String(text??'');
 const pattern=/(?:介绍|聊聊|认识|讲讲|了解)[^，。！？?!；;]{0,18}?(?:岗位|工具|方法|模型|概念|框架|产品|项目|技能)(?:叫做|叫作|叫|称为)[：:\s]*([A-Za-z][A-Za-z0-9 .-]{1,23}|[\u4e00-\u9fff]{2,10})(?=[，。！？?!；;]|$)/g;
 const matches=[...input.matchAll(pattern)].filter(m=>!/(?:不|没|非|不能|不应|不要|没有|不再|不会|不是|别)$/.test(input.slice(Math.max(0,m.index-4),m.index)));
 return matches.length===1?matches[0][1].trim():undefined;
}
