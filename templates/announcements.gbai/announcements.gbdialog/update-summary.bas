
let text = GET "announcements.gbkb/news/news.pdf"
let resume = LLM "Resume this document, in a table (DO NOT THINK) no_think: " + text

SET_BOT_MEMORY "resume", resume

let text1 = GET "announcements.gbkb/auxiliom/auxiliom.pdf"
SET_BOT_MEMORY "auxiliom", text1

let text2 = GET "announcements.gbkb/toolbix/toolbix.pdf"
SET_BOT_MEMORY "toolbix", text2