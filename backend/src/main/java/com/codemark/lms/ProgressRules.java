package com.codemark.lms;

import java.util.*;

final class ProgressRules {
  record Rule(String action,String role,int points,String label) {}
  static final List<Rule> RULES=List.of(
      new Rule("daily_login","student",3,"Đăng nhập hằng ngày"),
      new Rule("attendance","student",3,"Điểm danh hằng ngày trong lớp"),
      new Rule("material_download","student",3,"Tải tài liệu môn học"),
      new Rule("discussion_question","student",3,"Đặt câu hỏi trên diễn đàn"),
      new Rule("submission_on_time","student",4,"Nộp bài đúng hạn"),
      new Rule("quiz_participation","student",4,"Tham gia Quiz"),
      new Rule("submission_early","student",5,"Nộp bài sớm ít nhất 24 giờ"),
      new Rule("discussion_answer","student",5,"Trả lời câu hỏi của bạn học"),
      new Rule("peer_review","student",6,"Review chi tiết được giảng viên xác nhận"),
      new Rule("perfect_result","student",7,"Điểm tuyệt đối bài thi hoặc đồ án"),
      new Rule("best_answer","student",7,"Câu trả lời hữu ích nhất"),
      new Rule("teacher_material","teacher",3,"Đăng tài liệu hoặc slide"),
      new Rule("teacher_reply","teacher",4,"Giải đáp trong vòng 24 giờ"),
      new Rule("teacher_grading","teacher",5,"Chấm toàn bộ lớp đúng hạn"),
      new Rule("teacher_quiz","teacher",6,"Tạo Quiz tương tác"),
      new Rule("teacher_advanced_material","teacher",6,"Tài liệu tham khảo nâng cao"),
      new Rule("teacher_feedback","teacher",7,"Feedback chi tiết kèm sửa lỗi trực tiếp"));

  static Rule get(String action) {
    return RULES.stream().filter(r->r.action.equals(action)).findFirst().orElseThrow(()->new Api.Failure("invalid_progress_action",400));
  }
  static List<Map<String,Object>> list(String role) {
    return RULES.stream().filter(r->r.role.equals(role)).map(r->Api.map("action",r.action,"points",r.points,"label",r.label)).toList();
  }
}
