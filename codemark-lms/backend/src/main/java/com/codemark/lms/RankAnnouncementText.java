package com.codemark.lms;

import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** Shared wording for newly earned ranks and the older stored chronicles. */
final class RankAnnouncementText {
  private static final List<String> TIERS=List.of("Master","Ruby","Diamond","Gold","Silver","Bronze");
  private static final Set<String> ANNOUNCED=Set.of("Master","Ruby","Diamond","Gold");
  private static final String TIER="Master|Ruby|Diamond|Gold|Silver|Bronze";
  private static final Pattern LEGACY=Pattern.compile("^(.+):\\s*(.*?)\\s*(?:→|\\?|->)\\s*("+TIER+")\\s*\\((?:hạng\\s*)?#(\\d+)\\)\\.?$");
  private static final Pattern FANTASY=Pattern.compile("(?:đã thăng hạng lên|đã thăng chức hạng của mình lên|Bậc hạng mới của bạn là|Ngọn lửa thử thách đã đưa bạn về hạng) \\*\\*("+TIER+")\\*\\*");

  static boolean eligible(String tier) { return ANNOUNCED.contains(tier); }

  static String message(String name,String previous,String tier,int position,Object points) {
    if(!eligible(tier)) return "";
    int oldPosition=TIERS.indexOf(previous);
    boolean promoted=oldPosition<0 || TIERS.indexOf(tier)<oldPosition;
    return (promoted?"Xin chúc mừng chiến binh **":"Hỡi chiến binh **")+name+"**"+
        (promoted?" đã thăng chức hạng của mình lên **":"! Ngọn lửa thử thách đã đưa bạn về hạng **")+tier+"**! "+
        (points==null?"Bạn":"Với **"+points+" EXP**, bạn")+" đang giữ vị trí **#"+position+"** trên chiến trường. "+
        (promoted?"Vinh quang đã khắc tên bạn vào biên niên sử. Hãy tiếp tục chinh phục những đỉnh cao mới!":
          "Hãy nâng cao thanh kiếm tri thức, trở lại mạnh mẽ và giành lại vinh quang của mình!");
  }

  static String normalizeBody(String body) {
    return body.lines().map(RankAnnouncementText::normalizeLine).filter(line->!line.isBlank()).collect(Collectors.joining("\n"));
  }

  private static String normalizeLine(String line) {
    var legacy=LEGACY.matcher(line.trim());
    if(legacy.matches()) return message(legacy.group(1),legacy.group(2),legacy.group(3),Integer.parseInt(legacy.group(4)),null);
    var fantasy=FANTASY.matcher(line);
    if(fantasy.find()) {
      if(!eligible(fantasy.group(1))) return "";
      return line.replace(" đã thăng hạng lên **"," đã thăng chức hạng của mình lên **")
          .replace("**! bạn đang giữ vị trí", "**! Bạn đang giữ vị trí");
    }
    return line;
  }

  static String title(String oldTitle) {
    int course=oldTitle.indexOf(" · ");
    String title="Biên niên chiến hạng"+(course<0?"":oldTitle.substring(course));
    return title.substring(0,Math.min(180,title.length()));
  }
}
