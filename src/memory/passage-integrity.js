// Conservative analysis, never a rewrite or proof of completeness.
export function passageIssue(text){
  if(typeof text!=='string')return 'PASSAGE_INVALID';
  const value=text.trim();
  if(/\b(?:not a claim that|does not mean that|not imply that)\b[^.!?\n]*[^.!?:;\]\)]$/iu.test(value))return 'UNFINISHED_QUALIFICATION';
  if(/\b(?:and|or|because|although|unless|which|whose|into|such as)\s*$/iu.test(value))return 'DANGLING_CLAUSE';
  return null;
}
