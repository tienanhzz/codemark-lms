package com.codemark.lms;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class IdentityMigrationTest {
  @Test void upgradesExistingAssessmentsEvenAfterIdentityWasMigrated() throws Exception {
    var ds=new DriverManagerDataSource("jdbc:h2:mem:legacy_assessments;DB_CLOSE_DELAY=-1","sa","");
    try(var c=ds.getConnection();var s=c.createStatement()) {
      s.execute("CREATE TABLE cf_assessment(id BIGINT PRIMARY KEY,title VARCHAR(255))");
      s.execute("INSERT INTO cf_assessment VALUES(5,'Existing exam')");
    }
    var migration=new IdentityMigration();
    migration.identityMigrationRun(ds);
    try(var c=ds.getConnection();var s=c.createStatement();var rows=s.executeQuery("SELECT title,rank_weight FROM cf_assessment WHERE id=5")) {
      assertTrue(rows.next());assertEquals("Existing exam",rows.getString(1));assertEquals(1,rows.getDouble(2));
    }
    try(var c=ds.getConnection();var s=c.createStatement()) { s.execute("UPDATE cf_assessment SET rank_weight=2 WHERE id=5"); }
    migration.identityMigrationRun(ds);
    try(var c=ds.getConnection();var s=c.createStatement();var rows=s.executeQuery("SELECT rank_weight FROM cf_assessment WHERE id=5")) {
      assertTrue(rows.next());assertEquals(2,rows.getDouble(1));
    }
  }
  @Test void preservesLegacyUsersAndCanRunTwice() throws Exception {
    var ds=new DriverManagerDataSource("jdbc:h2:mem:legacy;DB_CLOSE_DELAY=-1","sa","");
    try(var c=ds.getConnection();var s=c.createStatement()) {
      s.execute("CREATE TABLE cf_user(id BIGINT PRIMARY KEY,email VARCHAR(255) UNIQUE,password_hash VARCHAR(255))");
      s.execute("INSERT INTO cf_user VALUES(12,'legacy@example.invalid','old-password-value')");
    }
    var migration=new IdentityMigration();
    assertEquals("migrated",migration.identityMigrationRun(ds));
    assertEquals("unchanged",migration.identityMigrationRun(ds));
    try(var c=ds.getConnection();var s=c.createStatement();var rows=s.executeQuery("SELECT id,student_id,pending_code,must_change_password FROM cf_user")) {
      assertTrue(rows.next());assertEquals(12,rows.getLong(1));assertNull(rows.getString(2));assertTrue(rows.getBoolean(3));assertTrue(rows.getBoolean(4));
    }
    try(var c=ds.getConnection();var columns=c.getMetaData().getColumns(null,null,"CF_USER","EMAIL")){assertFalse(columns.next());}
  }
  @Test void csvQuotedBomAndLimits() {
    var rows=Csv.read("\uFEFFstudentId,password\r\n2025000001,\"password,with,commas\"\r\n");
    assertEquals("password,with,commas",rows.get(1).get(1));
    assertThrows(Api.Failure.class,()->Csv.read("studentId,password\n\"unterminated"));
    assertThrows(Api.Failure.class,()->Csv.read("x".repeat(1048577)));
    assertThrows(Api.Failure.class,()->Csv.read("studentId,password\n"+"2025000001,password12345\n".repeat(1001)));
  }
}
