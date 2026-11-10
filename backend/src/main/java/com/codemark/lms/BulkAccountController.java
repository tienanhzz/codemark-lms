package com.codemark.lms;
import static com.codemark.lms.Api.*;
import jakarta.servlet.http.*;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;

@RestController @RequestMapping("/api/admin/bulk-accounts") @Transactional
class BulkAccountController {
  final Store store; final Access access; final RankService rank;
  BulkAccountController(Store s,Access a,RankService rank) { store=s; access=a; this.rank=rank; }
  @PostMapping Object process(HttpServletRequest r,@RequestBody Map<String,Object> b) {
    User actor=access.admin(r);
    boolean commit=bool(b,"commit",false), reset=bool(b,"resetExisting",false);
    var data=Csv.read(text(b,"csv",""));
    require(data.get(0).equals(List.of("studentId","password")),"invalid_csv_header",400);
    if(commit) { store.lock(store.all(RankPolicy.class).get(0)); store.lock(actor); }
    var before=commit?rank.board(actor,null):List.<Map<String,Object>>of();
    var counts=new HashMap<String,Integer>();
    for(int i=1;i<data.size();i++) counts.merge(data.get(i).get(0).trim(),1,Integer::sum);
    var report=new ArrayList<Map<String,Object>>(); int valid=0;
    for(int i=1;i<data.size();i++) {
      var row=data.get(i); String code=row.get(0).trim(), password=row.size()>1?row.get(1):"";
      String state="Hợp lệ";
      User existing=store.list(User.class,"where e.studentId=?1",code).stream().findFirst().orElse(null);
      if(!code.matches("[0-9]{10}")) state="Sai định dạng mã";
      else if(counts.get(code)>1) state="Trùng trong file";
      else if(existing!=null && (!reset || !existing.role.equals("student"))) state="Đã tồn tại";
      else if(row.size()!=2 || !Access.validPassword(password)) state="Mật khẩu không hợp lệ";
      boolean ok=state.equals("Hợp lệ");
      if(ok) {
        valid++;
        if(commit) {
          User u=existing==null?new User():existing;
          u.studentId=code; if(existing==null) u.name="Sinh viên "+code;
          u.passwordHash=access.hash(password); u.mustChangePassword=true; u.pendingCode=false; u.activeSession=null;
          if(existing==null) store.save(u);
        }
      }
      report.add(map("line",i+1,"studentId",code,"status",state,"valid",ok));
    }
    if(commit) { rank.announceChanges(before,actor); access.audit(actor,"bulk_accounts_created",r.getRemoteAddr(),"count",valid); }
    return map("rows",report,"valid",valid,"created",commit?valid:0);
  }
}
