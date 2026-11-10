package com.codemark.lms;

import java.awt.Color;
import java.io.*;
import java.text.Normalizer;
import java.text.NumberFormat;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.List;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.springframework.stereotype.Service;

/** A Unicode, paginated report that embeds its freely licensed Vietnamese-capable font. */
@Service
class TeacherRankReport {
  private static final float MARGIN=40;
  private static final float WIDTH=PDRectangle.A4.getWidth()-2*MARGIN;
  private static final float[] COLUMNS={38,220,96,90,71};
  private static final Color INK=new Color(25,44,58), MUTED=new Color(90,106,119), TEAL=new Color(15,90,95);
  private static final DateTimeFormatter TIME=DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm",Locale.forLanguageTag("vi-VN")).withZone(ZoneId.of("Asia/Ho_Chi_Minh"));

  byte[] render(String season,String scope,List<Map<String,Object>> rows,Set<Long> demoTeachers,Instant generatedAt) throws IOException {
    try(PDDocument document=new PDDocument(); InputStream fontStream=TeacherRankReport.class.getResourceAsStream("/fonts/NotoSans-Regular.ttf")) {
      if(fontStream==null) throw new IOException("Missing embedded report font");
      PDType0Font font=PDType0Font.load(document,fontStream,true);
      PDDocumentInformation info=new PDDocumentInformation(); info.setTitle("Vinh danh giảng viên · Reputation");
      info.setAuthor("CodeMark_ClassFlow"); info.setSubject("Bảng xếp hạng tín nhiệm giảng viên theo mùa"); document.setDocumentInformation(info);
      NumberFormat numbers=NumberFormat.getNumberInstance(Locale.forLanguageTag("vi-VN")); numbers.setMaximumFractionDigits(2);
      PDPageContentStream stream=null;
      float y=0;
      try {
        for(int index=0;index<rows.size();index++) {
          var row=rows.get(index);
          boolean sample=demoTeachers.contains(((Number)row.get("userId")).longValue());
          List<String> name=wrap(font,Objects.toString(row.get("name"),"Chưa có tên")+(sample?" (*)":""),10,COLUMNS[1]-16,3);
          float height=Math.max(34,name.size()*14+16);
          if(stream==null || y-height<94) {
            if(stream!=null) stream.close();
            PDPage page=new PDPage(PDRectangle.A4); document.addPage(page); stream=new PDPageContentStream(document,page);
            y=header(stream,font,season,scope,generatedAt,rows.size());
          }
          drawRow(stream,font,row,name,numbers,index,y,height); y-=height;
        }
        if(stream==null) {
          PDPage page=new PDPage(PDRectangle.A4); document.addPage(page); stream=new PDPageContentStream(document,page);
          y=header(stream,font,season,scope,generatedAt,0);
          text(stream,font,"Chưa có giảng viên trong phạm vi đã chọn.",10,MARGIN+10,y-25,MUTED);
        }
      } finally { if(stream!=null) stream.close(); }
      for(int index=0;index<document.getNumberOfPages();index++) {
        try(var footer=new PDPageContentStream(document,document.getPage(index),PDPageContentStream.AppendMode.APPEND,true,true)) {
          footer.setStrokingColor(new Color(217,225,230)); footer.moveTo(MARGIN,80); footer.lineTo(MARGIN+WIDTH,80); footer.stroke();
          text(footer,font,"Dữ liệu phục vụ đề xuất thi đua; không tự động thay đổi điểm học tập hoặc quyền lợi.",8,MARGIN,64,MUTED);
          if(!demoTeachers.isEmpty()) text(footer,font,"(*) Có điểm mẫu dùng kiểm thử; cần loại trừ khi xét khen thưởng thực tế.",8,MARGIN,49,MUTED);
          text(footer,font,"CodeMark_ClassFlow",8,MARGIN,27,MUTED);
          String page=(index+1)+" / "+document.getNumberOfPages();
          text(footer,font,page,8,MARGIN+WIDTH-width(font,page,8),27,MUTED);
        }
      }
      ByteArrayOutputStream output=new ByteArrayOutputStream(); document.save(output); return output.toByteArray();
    }
  }

  private float header(PDPageContentStream stream,PDType0Font font,String season,String scope,Instant generatedAt,int count) throws IOException {
    float y=PDRectangle.A4.getHeight()-MARGIN;
    text(stream,font,"VINH DANH GIẢNG VIÊN",20,MARGIN,y,INK); y-=22;
    text(stream,font,"BÁO CÁO TÍN NHIỆM · REPUTATION",9,MARGIN,y,TEAL); y-=24;
    for(String line:wrap(font,"Mùa: "+Objects.toString(season,"Chưa có mùa đang hoạt động"),10,WIDTH,2)) { text(stream,font,line,10,MARGIN,y,INK); y-=14; }
    for(String line:wrap(font,"Phạm vi: "+scope,10,WIDTH,2)) { text(stream,font,line,10,MARGIN,y,INK); y-=14; }
    text(stream,font,"Xuất lúc "+TIME.format(generatedAt)+" (Việt Nam) · "+count+" giảng viên",9,MARGIN,y,MUTED); y-=21;
    fill(stream,MARGIN,y-26,WIDTH,26,INK);
    String[] labels={"Hạng","Giảng viên","Mã giảng viên","Reputation","Bậc rank"}; float x=MARGIN;
    for(int i=0;i<labels.length;i++) { text(stream,font,labels[i],8,x+8,y-17,Color.WHITE); x+=COLUMNS[i]; }
    return y-26;
  }

  private void drawRow(PDPageContentStream stream,PDType0Font font,Map<String,Object> row,List<String> name,NumberFormat numbers,int index,float y,float height) throws IOException {
    fill(stream,MARGIN,y-height,WIDTH,height,index%2==0?new Color(242,247,248):Color.WHITE);
    stream.setStrokingColor(new Color(222,230,234)); stream.moveTo(MARGIN,y-height); stream.lineTo(MARGIN+WIDTH,y-height); stream.stroke();
    float x=MARGIN;
    text(stream,font,Objects.toString(row.get("position"),""),10,x+8,y-20,TEAL); x+=COLUMNS[0];
    for(int line=0;line<name.size();line++) text(stream,font,name.get(line),10,x+8,y-20-line*14,INK); x+=COLUMNS[1];
    text(stream,font,wrap(font,Objects.toString(row.get("studentId"),""),9,COLUMNS[2]-16,1).get(0),9,x+8,y-20,MUTED); x+=COLUMNS[2];
    String points=numbers.format(row.get("points") instanceof Number value?value.doubleValue():0);
    text(stream,font,points,10,x+COLUMNS[3]-10-width(font,points,10),y-20,TEAL); x+=COLUMNS[3];
    text(stream,font,wrap(font,Objects.toString(row.get("tier"),""),9,COLUMNS[4]-16,1).get(0),9,x+8,y-20,INK);
  }

  private static void fill(PDPageContentStream stream,float x,float y,float width,float height,Color color) throws IOException {
    stream.setNonStrokingColor(color); stream.addRect(x,y,width,height); stream.fill();
  }
  private static void text(PDPageContentStream stream,PDType0Font font,String value,float size,float x,float y,Color color) throws IOException {
    stream.beginText(); stream.setFont(font,size); stream.setNonStrokingColor(color); stream.newLineAtOffset(x,y); stream.showText(safe(font,value)); stream.endText();
  }
  private static float width(PDType0Font font,String text,float size) throws IOException { return font.getStringWidth(safe(font,text))/1000*size; }

  private static String safe(PDType0Font font,String value) throws IOException {
    String normalized=Normalizer.normalize(value,Normalizer.Form.NFC).replaceAll("[\\p{Cntrl}]"," ");
    StringBuilder result=new StringBuilder();
    for(int cp:normalized.codePoints().toArray()) {
      String character=new String(Character.toChars(cp));
      try { font.encode(character); result.append(character); } catch(IllegalArgumentException unsupported) { result.append('?'); }
    }
    return result.toString();
  }

  private static List<String> wrap(PDType0Font font,String value,float size,float maximum,int maximumLines) throws IOException {
    String text=safe(font,value).strip(); var result=new ArrayList<String>(); StringBuilder line=new StringBuilder();
    for(String word:text.split("\\s+")) {
      if(line.length()>0 && width(font,line+" "+word,size)>maximum) { result.add(line.toString()); line.setLength(0); }
      for(int cp:word.codePoints().toArray()) {
        String c=new String(Character.toChars(cp));
        if(width(font,line.toString()+c,size)>maximum && line.length()>0) { result.add(line.toString()); line.setLength(0); }
        line.append(c);
      }
      line.append(' ');
    }
    if(line.length()>0 || result.isEmpty()) result.add(line.toString().stripTrailing());
    if(result.size()>maximumLines) {
      result=new ArrayList<>(result.subList(0,maximumLines)); String last=result.get(maximumLines-1).stripTrailing();
      while(!last.isEmpty() && width(font,last+"…",size)>maximum) last=last.substring(0,last.offsetByCodePoints(last.length(),-1));
      result.set(maximumLines-1,last+"…");
    }
    return result;
  }
}
