package com.codemark.lms;
import java.util.*;

/** Small RFC-style CSV reader: BOM, quoted commas, newlines and escaped quotes. */
final class Csv {
  static List<List<String>> read(String text) {
    Api.require(text!=null && text.getBytes(java.nio.charset.StandardCharsets.UTF_8).length<=1048576,"file_too_large",400);
    text=text.replaceFirst("^\uFEFF","");
    var rows=new ArrayList<List<String>>(); var row=new ArrayList<String>(); var cell=new StringBuilder(); boolean quoted=false;
    for(int i=0;i<text.length();i++) {
      char ch=text.charAt(i);
      if(ch=='"') {
        if(quoted && i+1<text.length() && text.charAt(i+1)=='"') { cell.append('"'); i++; }
        else quoted=!quoted;
      } else if(!quoted && (ch==',' || ch=='\n' || ch=='\r')) {
        row.add(cell.toString()); cell.setLength(0);
        if(ch!=',') { if(ch=='\r' && i+1<text.length() && text.charAt(i+1)=='\n') i++; if(row.stream().anyMatch(v->!v.isBlank())) rows.add(row); row=new ArrayList<>(); }
      } else cell.append(ch);
      Api.require(rows.size()<=1001,"too_many_rows",400);
    }
    Api.require(!quoted,"invalid_csv",400);
    if(cell.length()>0 || !row.isEmpty()) { row.add(cell.toString()); rows.add(row); }
    Api.require(!rows.isEmpty() && rows.size()<=1001,"invalid_csv",400);
    return rows;
  }
}
