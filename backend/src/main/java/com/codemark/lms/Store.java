package com.codemark.lms;

import jakarta.persistence.*;
import java.util.*;
import org.springframework.stereotype.Repository;

@Repository
public class Store {
  @PersistenceContext EntityManager em;

  <T> T save(T entity) {
    em.persist(entity);
    return entity;
  }

  <T> T get(Class<T> type, long id) {
    T entity = em.find(type, id);
    Api.require(entity != null, "not_found", 404);
    return entity;
  }

  <T> List<T> list(Class<T> type, String condition, Object... values) {
    var query = em.createQuery("select e from " + type.getSimpleName() + " e " + condition, type);
    for (int i = 0; i < values.length; i++) query.setParameter(i + 1, values[i]);
    return query.getResultList();
  }

  <T> List<T> all(Class<T> type) {
    return list(type, "order by e.id");
  }

  void delete(Object entity) {
    em.remove(entity);
  }

  void flush() {
    em.flush();
  }

  void lock(Object entity) {
    em.lock(entity, LockModeType.PESSIMISTIC_WRITE);
  }
}
